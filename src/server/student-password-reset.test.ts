import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, email: "", delivered: true }));
vi.mock("@better-auth/drizzle-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(fixture.rows) };
});
vi.mock("@/server/db", () => ({ getDb: () => ({ insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }) }) }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: async ({ text }: { text: string }) => { fixture.email = text; return { delivered: fixture.delivered }; } }));
import { createAuth } from "./auth";
import { withPasswordResetDelivery } from "./password-reset-delivery";

beforeEach(() => {
  fixture.rows = { user: [], account: [], session: [], verification: [] };
  fixture.email = "";
  fixture.delivered = true;
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(40).toString("hex"));
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

it("captured reset email changes the password once and revokes existing sessions", async () => {
  const auth = createAuth();
  const oldPassword = randomBytes(24).toString("hex");
  const newPassword = randomBytes(24).toString("hex");
  const email = "student@example.test";
  await auth.api.signUpEmail({ body: { name: "Test Student", email, password: oldPassword } });
  expect(fixture.rows.session.length > 0).toBe(true);
  await withPasswordResetDelivery(() => auth.api.requestPasswordReset({ body: { email, redirectTo: "/portal/reset-password" } }));
  const url = new URL(fixture.email.split("\n").find((line) => line.startsWith("http"))!);
  const token = url.pathname.split("/").at(-1)!;
  expect(url.searchParams.get("callbackURL")).toBe("/portal/reset-password");
  expect(fixture.email.includes("30 minutes")).toBe(true);
  const expiresIn = new Date(fixture.rows.verification[0].expiresAt as string).getTime() - Date.now();
  expect(expiresIn > 1_790_000 && expiresIn <= 1_800_000).toBe(true);
  await auth.api.resetPassword({ body: { token, newPassword } });
  expect(fixture.rows.session.length).toBe(0);
  expect(fixture.rows.verification.length).toBe(0);
  expect(await auth.api.resetPassword({ body: { token, newPassword: oldPassword } }).then(() => false, () => true)).toBe(true);
  expect(await auth.api.signInEmail({ body: { email, password: oldPassword } }).then(() => false, () => true)).toBe(true);
  expect(await auth.api.signInEmail({ body: { email, password: newPassword } }).then(() => true, () => false)).toBe(true);
});

it("rejects expired links", async () => {
  const auth = createAuth();
  const password = randomBytes(24).toString("hex");
  await auth.api.signUpEmail({ body: { name: "Test Student", email: "student@example.test", password } });
  await auth.api.requestPasswordReset({ body: { email: "student@example.test", redirectTo: "/portal/reset-password" } });
  const token = new URL(fixture.email.split("\n").find((line) => line.startsWith("http"))!).pathname.split("/").at(-1)!;
  fixture.rows.verification[0].expiresAt = new Date(Date.now() - 1_000);
  expect(await auth.api.resetPassword({ body: { token, newPassword: randomBytes(24).toString("hex") } }).then(() => false, () => true)).toBe(true);
});

it("propagates delivery failure instead of reporting a sent email", async () => {
  const auth = createAuth();
  await auth.api.signUpEmail({ body: { name: "Test Student", email: "student@example.test", password: randomBytes(24).toString("hex") } });
  fixture.delivered = false;
  expect(await withPasswordResetDelivery(() => auth.api.requestPasswordReset({ body: { email: "student@example.test", redirectTo: "/portal/reset-password" } })).then(() => false, () => true)).toBe(true);
});
