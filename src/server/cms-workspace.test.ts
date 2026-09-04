import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCmsSnapshot } from "../lib/cms";

const state = vi.hoisted(() => ({ documents: [] as { key: string }[] }));
vi.mock("@/server/db", () => ({
  getDb: () => ({ transaction: async (run: (tx: unknown) => Promise<void>) => run({
    insert: () => ({ values: (values: { key: string }) => {
      state.documents.push(values);
      return { onConflictDoUpdate: async () => {} };
    } }),
  }) }),
}));

import { saveCmsSnapshot } from "./cms";

describe("workspace write isolation", () => {
  beforeEach(() => { state.documents = []; });
  it("website publishing cannot write booking availability", async () => {
    await saveCmsSnapshot(defaultCmsSnapshot, "test-actor", "website");
    expect(state.documents.map((row) => row.key)).toEqual(["global", "hero_slides", "pages", "forms"]);
  });
  it("explicit full seed still includes existing booking availability", async () => {
    await saveCmsSnapshot(defaultCmsSnapshot, "test-actor", "all");
    expect(state.documents.map((row) => row.key)).toContain("availability");
  });
});
