import { beforeEach, expect, it, vi } from "vitest";

const { consume, getDb } = vi.hoisted(() => ({
  consume: vi.fn(),
  getDb: vi.fn(() => { throw new Error("database must not be reached"); }),
}));
vi.mock("@/server/db", () => ({ getDb }));
vi.mock("@/server/public-rate-limit", async (original) => {
  const actual = await original<typeof import("@/server/public-rate-limit")>();
  return { ...actual, consumePublicSubmissionLimits: consume };
});
vi.mock("@/server/booking-mail", () => ({ enqueueBookingMail: vi.fn(), dispatchBookingMail: vi.fn() }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn() }));
vi.mock("@/server/site-mail", () => ({ sendPrimaryInboxMail: vi.fn() }));
vi.mock("@/server/website-cms", () => ({
  getActiveWebsiteForm: vi.fn(async (key: string) => ({ key, isActive: true })),
}));

import { POST as submitBooking } from "@/app/api/bookings/route";
import { POST as submitContact } from "@/app/api/contact/route";
import { POST as submitCourse } from "@/app/api/courses/route";
import { POST as submitSubscription } from "@/app/api/subscriptions/route";
import { PublicRateLimitError } from "@/server/public-rate-limit";

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://fixture.invalid/test";
  consume.mockReset();
  consume.mockResolvedValue(undefined);
  getDb.mockClear();
});

const oversized = (url: string, bytes: number) => new Request(url, {
  method: "POST",
  headers: { "content-type": "application/json", "content-length": String(bytes) },
  body: "{}",
});

it("rejects oversized public submission bodies before database work", async () => {
  const booking = await submitBooking(oversized("http://localhost:3001/api/bookings", 65 * 1024));
  const course = await submitCourse(oversized("http://localhost:3001/api/courses", 129 * 1024));
  const contact = await submitContact(oversized("http://localhost:3001/api/contact", 33 * 1024));
  const subscription = await submitSubscription(oversized("http://localhost:3001/api/subscriptions", 9 * 1024));
  for (const response of [booking, course, contact, subscription]) expect(response.status).toBe(413);
  expect(getDb).not.toHaveBeenCalled();
  expect(consume).not.toHaveBeenCalled();
});

it("returns a bounded rate-limit response for every public submission route", async () => {
  consume.mockRejectedValue(new PublicRateLimitError(37));
  const booking = await submitBooking(new Request("http://localhost:3001/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: "00000000-0000-4000-8000-000000000001", date: "2097-09-04", time: "09:00", name: "Fixture Client", email: "fixture@example.test", phone: "8765550100", consent: true, answers: {} }),
  }));
  const course = await submitCourse(new Request("http://localhost:3001/api/courses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offeringId: "00000000-0000-4000-8000-000000000002", applicantName: "Fixture Student", applicantEmail: "student@example.test", applicantPhone: "", organisationName: "", consent: true, participants: [{ name: "Fixture Student", email: "student@example.test", phone: "" }] }),
  }));
  const contact = await submitContact(new Request("http://localhost:3001/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Fixture Client", email: "fixture@example.test", subject: "General enquiry", message: "Please contact me about consultancy services.", consent: true }),
  }));
  const subscription = await submitSubscription(new Request("http://localhost:3001/api/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "fixture@example.test", consent: true, source: "website-newsletter" }),
  }));
  for (const response of [booking, course, contact, subscription]) {
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
  }
  expect(getDb).not.toHaveBeenCalled();
});
