import { eq } from "drizzle-orm";

import { profiles } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";

export class PortalAuthError extends Error {
  constructor(public status: 401 | 403, message: string) { super(message); }
}

export async function requirePortalProfile(request: Request) {
  if (!process.env.DATABASE_URL) throw new PortalAuthError(401, "The database is not configured.");
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) throw new PortalAuthError(401, "Sign in is required.");
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.authUserId, session.user.id)).limit(1);
  if (!profile?.active || profile.role !== "customer") throw new PortalAuthError(403, "An active client account is required.");
  return { session, profile };
}

export function portalErrorResponse(error: unknown) {
  if (error instanceof PortalAuthError) return Response.json({ ok: false, error: { message: error.message } }, { status: error.status });
  return Response.json({ ok: false, error: { message: "The requested operation could not be completed." } }, { status: 500 });
}
