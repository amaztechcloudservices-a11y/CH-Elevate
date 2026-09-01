import { describe, expect, it } from "vitest";

import { contactSchema } from "@/lib/contact";

describe("contactSchema", () => {
  it("accepts a complete enquiry", () => {
    const result = contactSchema.safeParse({
      name: "Grace Brown",
      email: "grace@example.com",
      subject: "Consultation",
      message: "I would like to arrange an initial consultation.",
      consent: true,
    });

    expect(result.success).toBe(true);
  });

  it("requires explicit consent", () => {
    const result = contactSchema.safeParse({
      name: "Grace Brown",
      email: "grace@example.com",
      subject: "Consultation",
      message: "I would like to arrange an initial consultation.",
      consent: false,
    });

    expect(result.success).toBe(false);
  });
});
