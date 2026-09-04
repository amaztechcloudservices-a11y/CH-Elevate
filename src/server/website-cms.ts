import { eq, inArray, sql } from "drizzle-orm";
import { auditLogs, cmsDocuments } from "@/db/schema";
import { defaultWebsiteCms, websiteCmsSchema, type WebsiteCmsSnapshot } from "@/lib/website-cms";
import { getDb } from "@/server/db";

const documents = { settings: "global", heroSlides: "hero_slides", pages: "pages", forms: "forms" } as const;
const isBookingForm = (value: unknown): boolean => !!value && typeof value === "object" && "key" in value && value.key === "booking";

export async function getWebsiteCms(): Promise<WebsiteCmsSnapshot> {
  const rows = await getDb().select().from(cmsDocuments).where(inArray(cmsDocuments.key, Object.values(documents)));
  const candidate: Record<string, unknown> = defaultWebsiteCms();
  for (const [field, key] of Object.entries(documents)) {
    const row = rows.find((row) => row.key === key);
    if (row) candidate[field] = field === "forms" && Array.isArray(row.data) ? row.data.filter((form) => !isBookingForm(form)) : row.data;
  }
  // Invalid stored content fails closed; never return defaults that could overwrite it on save.
  return websiteCmsSchema.parse(candidate);
}

export async function saveWebsiteCms(snapshot: WebsiteCmsSnapshot, actor: string) {
  const parsed = websiteCmsSchema.parse(snapshot);
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ch-elevate-website-cms'))`);
    const [existing] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.key, "forms")).for("update");
    const storedForms: unknown = existing?.data ?? [];
    if (!Array.isArray(storedForms)) throw new Error("Stored forms must be repaired before publishing.");
    const legacy = storedForms.filter(isBookingForm);
    if (parsed.forms.length + legacy.length > 30) throw new Error("The stored form limit would be exceeded.");
    for (const [field, key] of Object.entries(documents)) {
      const data = (field === "forms" ? [...parsed.forms, ...legacy] : parsed[field as keyof WebsiteCmsSnapshot]) as unknown as Record<string, unknown>;
      const values = { documentType: field, data, updatedByAuthUserId: actor, updatedAt: new Date() };
      await tx.insert(cmsDocuments).values({ key, ...values }).onConflictDoUpdate({ target: cmsDocuments.key, set: values });
    }
    await tx.insert(auditLogs).values({ actorAuthUserId: actor, action: "website.content_published", entityType: "website", entityId: "content" });
  });
  return parsed;
}
