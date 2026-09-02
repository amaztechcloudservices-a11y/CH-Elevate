import { describe, expect, it } from "vitest";

import {
  getSiteMailConfig,
  PRIMARY_SITE_EMAIL,
  PRIMARY_SITE_FROM,
} from "@/server/site-mail";

describe("site mail configuration", () => {
  it("uses the primary Google Workspace mailbox by default", () => {
    expect(getSiteMailConfig({})).toEqual({
      smtpUrl: "",
      from: PRIMARY_SITE_FROM,
      recipient: PRIMARY_SITE_EMAIL,
    });
  });

  it("allows environment-specific SMTP and addresses", () => {
    expect(getSiteMailConfig({
      SMTP_URL: "smtps://example.invalid",
      CONTACT_FROM: "Custom Sender <sender@example.com>",
      CONTACT_TO: "inbox@example.com",
    })).toEqual({
      smtpUrl: "smtps://example.invalid",
      from: "Custom Sender <sender@example.com>",
      recipient: "inbox@example.com",
    });
  });
});
