import { eq } from "drizzle-orm";

import { cmsDocuments } from "@/db/schema";
import {
  cmsSnapshotSchema,
  defaultCmsSnapshot,
  type CmsSnapshot,
} from "@/lib/cms";
import { getDb } from "@/server/db";

const documentMap = {
  settings: "global",
  heroSlides: "hero_slides",
  pages: "pages",
  forms: "forms",
  availability: "availability",
} as const;

export async function getCmsSnapshot(): Promise<CmsSnapshot> {
  if (!process.env.DATABASE_URL) {
    return structuredClone(defaultCmsSnapshot);
  }

  try {
    const rows = await getDb().select().from(cmsDocuments);
    const candidate: Record<string, unknown> = structuredClone(
      defaultCmsSnapshot,
    );

    for (const row of rows) {
      const field = Object.entries(documentMap).find(
        ([, key]) => key === row.key,
      )?.[0];
      if (field) candidate[field] = row.data;
    }

    const parsed = cmsSnapshotSchema.safeParse(candidate);
    return parsed.success ? parsed.data : structuredClone(defaultCmsSnapshot);
  } catch {
    return structuredClone(defaultCmsSnapshot);
  }
}

export async function saveCmsSnapshot(
  snapshot: CmsSnapshot,
  actorAuthUserId: string,
) {
  const parsed = cmsSnapshotSchema.parse(snapshot);
  const database = getDb();
  const now = new Date();

  await database.transaction(async (transaction) => {
    for (const [field, key] of Object.entries(documentMap)) {
      const data = parsed[field as keyof CmsSnapshot] as unknown as Record<
        string,
        unknown
      >;
      await transaction
        .insert(cmsDocuments)
        .values({
          key,
          documentType: field,
          data,
          updatedByAuthUserId: actorAuthUserId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: cmsDocuments.key,
          set: {
            documentType: field,
            data,
            updatedByAuthUserId: actorAuthUserId,
            updatedAt: now,
          },
        });
    }
  });

  return parsed;
}

export async function resetCmsDocument(key: keyof CmsSnapshot) {
  await getDb()
    .delete(cmsDocuments)
    .where(eq(cmsDocuments.key, documentMap[key]));
}
