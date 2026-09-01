import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import * as schema from "@/db/schema";
import { profiles } from "@/db/schema";
import { getDb } from "@/server/db";
import { sendCourseMail } from "@/server/course-mail";

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
      sendResetPassword: async ({ user: authUser, url }) => {
        await sendCourseMail({ to: authUser.email, subject: "Reset your CH Elevate password", text: `Use this secure link to reset your password:\n${url}\n\nIf you did not request this, you can ignore this email.` });
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
