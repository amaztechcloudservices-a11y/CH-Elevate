import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));

import { PublicRateLimitError, consumePublicSubmissionLimits } from "@/server/public-rate-limit";

const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `public_rate_limit_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;
let setupPool: Pool;

beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href });
  await setupPool.query(`create schema "${fixtureSchema}"`);
  await setupPool.query(`create table "${fixtureSchema}".public_submission_limits (
    scope text not null,
    key_hash text not null,
    window_started_at timestamptz not null,
    request_count integer not null,
    expires_at timestamptz not null,
    primary key (scope, key_hash, window_started_at)
  )`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` });
  database = drizzle(pool);
});

afterAll(async () => {
  if (pool) await pool.end();
  if (setupPool) {
    await setupPool.query(`drop schema "${fixtureSchema}" cascade`);
    await setupPool.end();
  }
});

it.skipIf(!enabled)("atomically enforces a fixed-window limit without storing the submitted identity", async () => {
  const now = new Date("2097-09-03T12:00:00.000Z");
  const rule = { scope: "booking_identity", key: "sensitive@example.test:event-1", limit: 2, windowMs: 60_000 };

  await expect(consumePublicSubmissionLimits([rule], now)).resolves.toBeUndefined();
  await expect(consumePublicSubmissionLimits([rule], now)).resolves.toBeUndefined();
  await expect(consumePublicSubmissionLimits([rule], now)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 });

  const rows = (await pool.query("select key_hash, request_count from public_submission_limits")).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].key_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(rows[0].key_hash).not.toContain("sensitive@example.test");
  expect(rows[0].request_count).toBe(2);
});

it.skipIf(!enabled)("keeps identities and windows separate and rolls back all counters when one rule is denied", async () => {
  const start = new Date("2097-09-03T13:00:00.000Z");
  const global = { scope: "course_global", key: "all", limit: 1, windowMs: 60_000 };
  const first = { scope: "course_identity", key: "first@example.test:offering", limit: 3, windowMs: 60_000 };
  const second = { ...first, key: "second@example.test:offering" };

  await consumePublicSubmissionLimits([global, first], start);
  await expect(consumePublicSubmissionLimits([global, second], start)).rejects.toBeInstanceOf(PublicRateLimitError);
  expect((await pool.query("select request_count from public_submission_limits where scope='course_identity'")).rows).toEqual([{ request_count: 1 }]);

  await expect(consumePublicSubmissionLimits([global, second], new Date(start.getTime() + 60_000))).resolves.toBeUndefined();
  expect((await pool.query("select count(*)::int as count from public_submission_limits where scope='course_identity'")).rows[0].count).toBe(2);
});

it.skipIf(!enabled)("cannot exceed a limit under concurrent requests", async () => {
  const now = new Date("2097-09-03T14:00:00.000Z");
  const rule = { scope: "booking_concurrent", key: "same", limit: 3, windowMs: 60_000 };
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumePublicSubmissionLimits([rule], now)));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(5);
  expect((await pool.query("select request_count from public_submission_limits where scope='booking_concurrent'")).rows).toEqual([{ request_count: 3 }]);
});
