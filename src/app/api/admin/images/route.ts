import { z } from "zod";

import { auditLogs } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";
import {
  PublicImageError,
  discardPublicImage,
  readPublicImageUpload,
  savePublicImage,
} from "@/server/public-image-storage";

export const runtime = "nodejs";

const uploadSchema = z.object({ file: z.instanceof(File) }).strict();
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });

export async function POST(request: Request) {
  let stored: Awaited<ReturnType<typeof savePublicImage>> | undefined;
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const form = await readPublicImageUpload(request);
    const entries = [...form.entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return fail("Duplicate upload fields are not allowed.", 422);
    const parsed = uploadSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) return fail("Choose one image from your device.", 422);
    stored = await savePublicImage(parsed.data.file);
    await getDb().insert(auditLogs).values({
      actorAuthUserId: session.user.id,
      action: "public_image.uploaded",
      entityType: "public_image",
      entityId: stored.filename,
      metadata: { mimeType: stored.mimeType, sizeBytes: stored.sizeBytes },
    });
    const data = { url: stored.url, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes };
    stored = undefined;
    return Response.json({ ok: true, data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (stored) await discardPublicImage(stored.filename);
    if (error instanceof PublicImageError) return fail(error.message, 422);
    return adminErrorResponse(error);
  }
}
