import { eq } from "drizzle-orm";

import { profiles } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";

export class AdminAuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function requireClientAdmin(request: Request) {
  if (!process.env.DATABASE_URL) {
    throw new AdminAuthError(401, "The database is not configured.");
  }

  const session = await getAuth().api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    throw new AdminAuthError(401, "Sign in is required.");
  }

  const [profile] = await getDb()
    .select({
      id: profiles.id,
      role: profiles.role,
      active: profiles.active,
    })
    .from(profiles)
    .where(eq(profiles.authUserId, session.user.id))
    .limit(1);

  if (!profile?.active || profile.role !== "client_admin") {
    throw new AdminAuthError(
      403,
      "A client administrator account is required.",
    );
  }

  return { session, profile };
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: error.status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN",
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return Response.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "The requested operation could not be completed.",
      },
    },
    { status: 500 },
  );
}
