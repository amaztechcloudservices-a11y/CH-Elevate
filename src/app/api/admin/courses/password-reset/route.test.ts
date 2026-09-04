import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authorize: vi.fn(), reset: vi.fn(), smtpUrl: "smtp://test.invalid", student: { id: "student-id", email: "student@example.test" } as { id: string; email: string } | undefined,
  recent: false, audit: vi.fn(), select: vi.fn(),
}));
vi.mock("@/server/admin-auth", async (original) => ({ ...await original<typeof import("@/server/admin-auth")>(), requireClientAdmin: state.authorize }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { requestPasswordReset: state.reset } }) }));
vi.mock("@/server/site-mail", () => ({ getSiteMailConfig: () => ({ smtpUrl: state.smtpUrl }) }));
vi.mock("@/server/password-reset-delivery", () => ({ withPasswordResetDelivery: (operation: () => Promise<unknown>) => operation() }));
vi.mock("@/server/db", () => ({ getDb: () => ({
  select: state.select,
  transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
    execute: vi.fn(),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.recent ? [{ id: "recent" }] : [] }) }) }),
    insert: () => ({ values: state.audit }),
  }),
}) }));
import { AdminAuthError } from "@/server/admin-auth";
import { POST } from "./route";

const participantId = "11111111-1111-4111-8111-111111111111";
function request(body: unknown = { participantId }, origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/admin/courses/password-reset", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.authorize.mockResolvedValue({ session: { user: { id: "admin-id" } } });
  state.reset.mockResolvedValue({ status: true });
  state.smtpUrl = "smtp://test.invalid";
  state.student = { id: "student-id", email: "student@example.test" };
  state.recent = false;
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => state.student ? [state.student] : [] };
  state.select.mockReturnValue(query);
});
it.each([401, 403] as const)("rejects unauthorized access (%i)", async (status) => {
  state.authorize.mockRejectedValue(new AdminAuthError(status, "Denied"));
  expect((await POST(request())).status).toBe(status);
  expect(state.select).not.toHaveBeenCalled();
  expect(state.reset).not.toHaveBeenCalled();
});
it("rejects cross-origin requests", async () => {
  expect((await POST(request({ participantId }, "https://untrusted.example"))).status).toBe(403);
  expect(state.reset).not.toHaveBeenCalled();
});
it.each([{ participantId: "invalid" }, { participantId, email: "attacker@example.test" }])("rejects invalid or injected targets", async (body) => {
  expect((await POST(request(body))).status).toBe(422);
  expect(state.reset).not.toHaveBeenCalled();
});
it("does not reset missing or ineligible student accounts", async () => {
  state.student = undefined;
  expect((await POST(request())).status).toBe(404);
  expect(state.reset).not.toHaveBeenCalled();
});
it("does not claim success when email is unconfigured", async () => {
  state.smtpUrl = "";
  expect((await POST(request())).status).toBe(503);
  expect(state.reset).not.toHaveBeenCalled();
});
it("enforces the persistent cooldown", async () => {
  state.recent = true;
  expect((await POST(request())).status).toBe(429);
  expect(state.reset).not.toHaveBeenCalled();
});
it("audits and sends only to the server-resolved account without returning a token", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(state.reset).toHaveBeenCalledWith({ body: { email: "student@example.test", redirectTo: "/portal/reset-password" } });
  expect(state.audit).toHaveBeenCalledWith({ actorAuthUserId: "admin-id", action: "course.student_password_reset_requested", entityType: "student_account", entityId: "student-id" });
  expect(await response.json()).toEqual({ ok: true, message: "Reset email sent. The student has 30 minutes to choose a new password." });
});
it("handles mail failure without exposing internal details", async () => {
  state.reset.mockRejectedValue(new Error("Sensitive internal mail detail"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("Sensitive");
});
