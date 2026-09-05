import { z } from "zod";

import { formSubmissions, subscriptions } from "@/db/schema";
import { getDb } from "@/server/db";
import { PublicRateLimitError, consumePublicSubmissionLimits } from "@/server/public-rate-limit";
import { JsonBodyError, readBoundedJson } from "@/server/request-body";
import { getActiveWebsiteForm } from "@/server/website-cms";

const SUBSCRIPTION_BODY_LIMIT = 8 * 1024;
const SUBSCRIPTION_RATE_WINDOW = 60 * 60 * 1000;

const subscriptionSchema = z.object({
  email: z.email().max(254),
  consent: z.literal(true),
  source: z.string().trim().max(80).default("website"),
});

export async function POST(request: Request) {
  try {
    const form = await getActiveWebsiteForm("newsletter");
    if (!form) return Response.json({ ok: false, error: "Newsletter signup is not available at this time." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const parsed = subscriptionSchema.safeParse(await readBoundedJson(request, SUBSCRIPTION_BODY_LIMIT));

    if (!parsed.success) return Response.json({ ok: false, error: "Please enter a valid email address and confirm your subscription." }, { status: 400, headers: { "Cache-Control": "no-store" } });

    const email = parsed.data.email.toLowerCase();
    await consumePublicSubmissionLimits([
      { scope: "newsletter_global", key: "all", limit: 300, windowMs: SUBSCRIPTION_RATE_WINDOW },
      { scope: "newsletter_identity", key: email, limit: 5, windowMs: SUBSCRIPTION_RATE_WINDOW },
    ]);

    const subscription = await getDb().transaction(async (transaction) => {
    const [created] = await transaction
      .insert(subscriptions)
      .values({ ...parsed.data, email })
      .onConflictDoUpdate({
        target: subscriptions.email,
        set: {
          consent: true,
          source: parsed.data.source,
          subscribedAt: new Date(),
          unsubscribedAt: null,
        },
      })
      .returning({
        id: subscriptions.id,
        email: subscriptions.email,
      });

    await transaction.insert(formSubmissions).values({
      formKey: "newsletter",
      payload: {
        email,
        consent: parsed.data.consent,
        source: parsed.data.source,
      },
      sourcePath: "/",
    });
    return created;
    });

    return Response.json({ ok: true, subscription }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof JsonBodyError) return Response.json({ ok: false, error: error.code === "too_large" ? "The subscription request is too large." : "The subscription request must contain valid JSON." }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof PublicRateLimitError) return Response.json({ ok: false, error: "Too many subscription requests have been submitted. Please wait before trying again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(error.retryAfterSeconds) } });
    return Response.json({ ok: false, error: "Newsletter signup is temporarily unavailable. Please try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
