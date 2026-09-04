import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db";

export type PublicSubmissionLimit = {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
};

export class PublicRateLimitError extends Error {
  readonly status = 429;

  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests.");
  }
}

const hashKey = (scope: string, key: string) => createHash("sha256").update(scope).update("\0").update(key).digest("hex");

export async function consumePublicSubmissionLimits(rules: PublicSubmissionLimit[], now = new Date()): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`delete from public_submission_limits where expires_at < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`);
    for (const rule of rules) {
      if (!Number.isSafeInteger(rule.limit) || rule.limit < 1 || !Number.isSafeInteger(rule.windowMs) || rule.windowMs < 1) throw new Error("Invalid public submission limit.");
      const windowStartedAt = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
      const expiresAt = new Date(windowStartedAt.getTime() + rule.windowMs);
      const result = await tx.execute(sql`
        insert into public_submission_limits (scope, key_hash, window_started_at, request_count, expires_at)
        values (${rule.scope}, ${hashKey(rule.scope, rule.key)}, ${windowStartedAt}, 1, ${expiresAt})
        on conflict (scope, key_hash, window_started_at)
        do update set request_count = public_submission_limits.request_count + 1,
                      expires_at = excluded.expires_at
        where public_submission_limits.request_count < ${rule.limit}
        returning request_count
      `);
      if (result.rows.length === 0) throw new PublicRateLimitError(Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)));
    }
  });
}
