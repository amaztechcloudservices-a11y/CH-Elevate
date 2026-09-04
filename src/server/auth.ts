import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import * as schema from "@/db/schema";
import { profiles } from "@/db/schema";
import { getDb } from "@/server/db";
import { sendPasswordResetEmail } from "@/server/password-reset-delivery";

export function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!baseURL || !secret) {
    throw new Error("BETTER_AUTH_URL and BETTER_AUTH_SECRET are required.");
  }

  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
      : undefined;

  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: authUser, url }) => {
        await sendPasswordResetEmail(authUser.email, url);
      },
    },
    socialProviders: google ? { google } : undefined,
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            await getDb()
              .insert(profiles)
              .values({
                authUserId: createdUser.id,
                displayName: createdUser.name,
                role: "customer",
              })
              .onConflictDoNothing();
          },
        },
      },
    },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  authInstance ??= createAuth();
  return authInstance;
}
