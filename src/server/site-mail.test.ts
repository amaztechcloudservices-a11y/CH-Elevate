import { createServer } from "node:net";
import { describe, expect, it } from "vitest";

import {
  checkSiteMailConnection,
  getSiteMailConfig,
  PRIMARY_SITE_EMAIL,
  PRIMARY_SITE_FROM,
} from "@/server/site-mail";

it("distinguishes configured SMTP from a verified reachable connection", async () => {
  const server = createServer((socket) => {
    socket.write("220 localhost test SMTP\r\n");
    socket.on("data", (chunk) => {
      const command = chunk.toString().trim().toUpperCase();
      if (command.startsWith("EHLO") || command.startsWith("HELO")) socket.write("250-localhost\r\n250 OK\r\n");
      else if (command.startsWith("QUIT")) { socket.write("221 Bye\r\n"); socket.end(); }
      else socket.write("250 OK\r\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback SMTP fixture did not start.");

  try {
    await expect(checkSiteMailConnection({ SMTP_URL: "" }, 250)).resolves.toEqual({ configured: false, reachable: false, reason: "SMTP is not configured." });
    await expect(checkSiteMailConnection({ SMTP_URL: `smtp://127.0.0.1:${address.port}?ignoreTLS=true` }, 1_000)).resolves.toEqual({ configured: true, reachable: true, reason: "SMTP connection and authentication succeeded." });
    await expect(checkSiteMailConnection({ SMTP_URL: "smtp://127.0.0.1:1?ignoreTLS=true" }, 250)).resolves.toMatchObject({ configured: true, reachable: false });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

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
