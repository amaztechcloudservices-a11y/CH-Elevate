import { eq } from "drizzle-orm";

import { profiles, user } from "../src/db/schema";
import { getDb } from "../src/server/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    throw new Error("Usage: pnpm admin:promote admin@example.com");
  }

  const [authUser] = await getDb()
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!authUser) {
    throw new Error(
      `No Better Auth user exists for ${email}. Create the account first, then run this command again.`,
    );
  }

  await getDb()
    .insert(profiles)
    .values({
      authUserId: authUser.id,
      displayName: authUser.name,
      role: "client_admin",
      active: true,
    })
    .onConflictDoUpdate({
      target: profiles.authUserId,
      set: {
        displayName: authUser.name,
        role: "client_admin",
        active: true,
        updatedAt: new Date(),
      },
    });

  process.stdout.write(`Promoted ${authUser.email} to client administrator.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Promotion failed."}\n`,
  );
  process.exitCode = 1;
});
