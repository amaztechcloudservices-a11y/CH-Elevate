import { z } from "zod";

import { formSubmissions, subscriptions } from "@/db/schema";
import { getDb } from "@/server/db";

const subscriptionSchema = z.object({
  email: z.email().max(254),
  consent: z.literal(true),
  source: z.string().trim().max(80).default("website"),
});

export async function POST(request: Request) {
  const parsed = subscriptionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const subscription = await getDb().transaction(async (transaction) => {
    const [created] = await transaction
      .insert(subscriptions)
      .values(parsed.data)
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
        email: parsed.data.email,
        consent: parsed.data.consent,
        source: parsed.data.source,
      },
      sourcePath: "/",
    });
    return created;
  });

  return Response.json({ ok: true, subscription }, { status: 201 });
}
