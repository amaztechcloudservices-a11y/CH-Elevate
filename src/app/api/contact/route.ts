import { contacts, formSubmissions } from "@/db/schema";
import { contactSchema } from "@/lib/contact";
import { getDb } from "@/server/db";
import { PublicRateLimitError, consumePublicSubmissionLimits } from "@/server/public-rate-limit";
import { JsonBodyError, readBoundedJson } from "@/server/request-body";
import { sendPrimaryInboxMail } from "@/server/site-mail";
import { getActiveWebsiteForm } from "@/server/website-cms";

const CONTACT_BODY_LIMIT = 32 * 1024;
const CONTACT_RATE_WINDOW = 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const form = await getActiveWebsiteForm("contact");
    if (!form) return Response.json({ ok: false, error: "The enquiry form is not accepting submissions at this time." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const parsed = contactSchema.safeParse(await readBoundedJson(request, CONTACT_BODY_LIMIT));

    if (!parsed.success) {
      return Response.json(
        { ok: false, error: "Please review the form fields.", issues: parsed.error.issues.map(({ path, message }) => ({ field: path.join("."), message })) },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await consumePublicSubmissionLimits([
      { scope: "contact_global", key: "all", limit: 200, windowMs: CONTACT_RATE_WINDOW },
      { scope: "contact_identity", key: parsed.data.email.toLowerCase(), limit: 10, windowMs: CONTACT_RATE_WINDOW },
    ]);

    const enquiry = await getDb().transaction(async (transaction) => {
    const [created] = await transaction
      .insert(contacts)
      .values(parsed.data)
      .returning({ id: contacts.id, status: contacts.status });

    await transaction.insert(formSubmissions).values({
      formKey: "contact",
      payload: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone ?? "",
        company: parsed.data.company ?? "",
        subject: parsed.data.subject,
        message: parsed.data.message,
        consent: parsed.data.consent,
      },
      sourcePath: "/contact",
    });

    return created;
    });

    const delivery = await sendPrimaryInboxMail({
    replyTo: parsed.data.email,
    subject: `Website enquiry: ${parsed.data.subject}`,
    text: [
      `Name: ${parsed.data.name}`,
      `Email: ${parsed.data.email}`,
      `Phone: ${parsed.data.phone ?? "Not provided"}`,
      `Company: ${parsed.data.company ?? "Not provided"}`,
      "",
      parsed.data.message,
    ].join("\n"),
    });

    return Response.json(
      { ok: true, enquiry, ...(!delivery.delivered ? { message: "Your enquiry was saved, but its inbox notification was delayed. Our team can still review it." } : {}) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof JsonBodyError) return Response.json({ ok: false, error: error.code === "too_large" ? "The enquiry is too large." : "The enquiry must contain valid JSON." }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof PublicRateLimitError) return Response.json({ ok: false, error: "Too many enquiries have been submitted. Please wait before trying again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(error.retryAfterSeconds) } });
    return Response.json({ ok: false, error: "Your enquiry could not be submitted. Please try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
