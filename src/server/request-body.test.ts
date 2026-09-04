import { describe, expect, it } from "vitest";

import { readBoundedJson } from "@/server/request-body";

const request = (body: BodyInit, headers: HeadersInit = {}) => new Request("http://localhost/api/test", {
  method: "POST",
  body,
  headers: { "content-type": "application/json", ...headers },
  ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
} as RequestInit);

describe("readBoundedJson", () => {
  it("parses a JSON object within the configured byte limit", async () => {
    await expect(readBoundedJson(request('{"name":"Arvette"}'), 64)).resolves.toEqual({ name: "Arvette" });
  });

  it("rejects an oversized declared content length before reading the body", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("the body must not be read");
      },
    });
    await expect(readBoundedJson(request(body, { "content-length": "65" }), 64)).rejects.toMatchObject({
      code: "too_large",
      status: 413,
    });
  });

  it("enforces the actual streamed byte count when content length is missing or false", async () => {
    const oversized = "é".repeat(33);
    await expect(readBoundedJson(request(oversized), 64)).rejects.toMatchObject({ code: "too_large", status: 413 });
    await expect(readBoundedJson(request(oversized, { "content-length": "1" }), 64)).rejects.toMatchObject({ code: "too_large", status: 413 });
  });

  it("distinguishes malformed and empty JSON from an oversized body", async () => {
    await expect(readBoundedJson(request("{"), 64)).rejects.toMatchObject({ code: "invalid_json", status: 400 });
    await expect(readBoundedJson(request(""), 64)).rejects.toMatchObject({ code: "invalid_json", status: 400 });
  });

  it("rejects invalid content-length values without trusting them", async () => {
    await expect(readBoundedJson(request("{}", { "content-length": "not-a-number" }), 64)).rejects.toMatchObject({ code: "invalid_length", status: 400 });
    await expect(readBoundedJson(request("{}", { "content-length": "-1" }), 64)).rejects.toMatchObject({ code: "invalid_length", status: 400 });
  });
});
