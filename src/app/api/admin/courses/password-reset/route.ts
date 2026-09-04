import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, profiles, registrationParticipants, user } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { getSiteMailConfig } from "@/server/site-mail";
import { withPasswordResetDelivery } from "@/server/password-reset-delivery";

const inputSchema = z.object({ participantId: z.string().uuid() }).strict();
const errorResponse = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    // Only the same-origin admin UI may trigger an account-recovery email.
    if (request.headers.get("origin") !== new URL(request.url).origin) return errorResponse("A same-origin request is required.", 403);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Select a valid student registration.", 422);

    const database = getDb();
    // Resolve the destination on the server; never accept an arbitrary email or role.
    const [student] = await database.select({ id: user.id, email: user.email })
      .from(registrationParticipants)
      .innerJoin(user, eq(user.email, registrationParticipants.emailNormalized))
      .innerJoin(profiles, eq(profiles.authUserId, user.id))
      .where(and(eq(registrationParticipants.id, parsed.data.participantId), eq(profiles.role, "customer"), eq(profiles.active, true)))
      .limit(1);
    if (!student) return errorResponse("No active student account was found. The student must activate their portal account first.", 404);
    if (!getSiteMailConfig().smtpUrl) return errorResponse("Email delivery is not configured. No reset email was sent.", 503);

    // A database lock and audit-backed cooldown work across app instances and restarts.
    const allowed = await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-password-reset:${student.id}`}))`);
      const [recent] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(
        eq(auditLogs.action, "course.student_password_reset_requested"),
        eq(auditLogs.entityId, student.id),
        gte(auditLogs.createdAt, new Date(Date.now() - 60_000)),
      )).limit(1);
      if (recent) return false;
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.student_password_reset_requested", entityType: "student_account", entityId: student.id });
      return true;
    });
    if (!allowed) return errorResponse("A reset was recently requested for this student. Wait one minute before trying again.", 429);

    try {
      await withPasswordResetDelivery(() => getAuth().api.requestPasswordReset({ body: { email: student.email, redirectTo: "/portal/reset-password" } }));
    } catch {
      return errorResponse("The reset email could not be sent. Check email delivery and try again in one minute.", 503);
    }
    return Response.json({ ok: true, message: "Reset email sent. The student has 30 minutes to choose a new password." });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
