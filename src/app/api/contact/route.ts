import { contacts, formSubmissions } from "@/db/schema";
import { contactSchema } from "@/lib/contact";
import { getDb } from "@/server/db";
import { sendPrimaryInboxMail } from "@/server/site-mail";

export async function POST(request: Request) {
  const parsed = contactSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Please review the form fields.",
        issues: parsed.error.issues.map(({ path, message }) => ({
          field: path.join("."),
          message,
        })),
      },
      { status: 400 },
    );
  }

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

  await sendPrimaryInboxMail({
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

  return Response.json({ ok: true, enquiry }, { status: 201 });
}
