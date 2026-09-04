import { websiteCmsSchema } from "@/lib/website-cms";
import {
  adminErrorResponse,
  requireClientAdmin,
} from "@/server/admin-auth";
import { getWebsiteCms, saveWebsiteCms } from "@/server/website-cms";

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    return Response.json({ ok: true, data: await getWebsiteCms() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
    const parsed = websiteCmsSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Review the content fields and try again.",
            details: parsed.error.flatten(),
          },
        },
        { status: 422 },
      );
    }

    const data = await saveWebsiteCms(parsed.data, session.user.id);
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
