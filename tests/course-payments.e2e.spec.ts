import { expect, test } from "@playwright/test";

test("course administration records a real receipt and separates currency balances", async ({ page }) => {
  const registrationId = "11111111-1111-4111-8111-111111111111";
  const participantId = "22222222-2222-4222-8222-222222222222";
  const patched: Record<string, unknown>[] = [];
  const data = {
    courses: [],
    offerings: [],
    materials: [],
    recentActivity: [],
    metrics: {
      pending: 1,
      upcoming: 0,
      waitlisted: 0,
      outstandingByCurrency: [
        { currency: "JMD", totalCents: 15_000 },
        { currency: "USD", totalCents: 8_000 },
      ],
    },
    registrations: [{
      currency: "USD",
      registration: {
        id: registrationId,
        status: "pending_review",
        paymentStatus: "unpaid",
        paymentReference: null,
        amountDueCents: 10_000,
        paidCents: 0,
        currency: "USD",
      },
      courseTitle: "Project leadership",
      offeringCode: "PL-01",
      startsAt: "2097-10-01T14:00:00.000Z",
      organisationName: null,
      participantId,
      participantName: "Alex Morgan",
      participantEmail: "alex@example.com",
      participantStatus: "pending_review",
      attendance: "not_recorded",
      completedAt: null,
    }],
  };

  await page.route("**/api/admin/access", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/admin/courses", async (route) => {
    if (route.request().method() === "PATCH") {
      patched.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, data: { id: registrationId } } });
      return;
    }
    await route.fulfill({ json: { ok: true, data } });
  });

  await page.goto("/admin/courses", { waitUntil: "networkidle" });
  await expect(page.getByText("JMD 150.00 · USD 80.00")).toBeVisible();

  const payment = page.getByRole("form", { name: "Payment for Alex Morgan" });
  await payment.getByRole("combobox", { name: "Payment status for Alex Morgan" }).selectOption("partially_paid");
  await payment.getByLabel("Transaction amount (USD) for Alex Morgan").fill("25.50");
  await payment.getByLabel("Payment reference for Alex Morgan").fill("BANK-42");
  await payment.getByRole("button", { name: "Apply payment" }).click();

  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0]).toEqual({
    action: "payment",
    id: registrationId,
    paymentStatus: "partially_paid",
    transactionCents: 2550,
    paymentReference: "BANK-42",
  });
});
