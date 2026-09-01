import { cmsSnapshotSchema } from "@/lib/cms";
import {
  adminErrorResponse,
  requireClientAdmin,
} from "@/server/admin-auth";
import { getCmsSnapshot, saveCmsSnapshot } from "@/server/cms";

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    return Response.json({ ok: true, data: await getCmsSnapshot() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    const parsed = cmsSnapshotSchema.safeParse(await request.json());

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

    const data = await saveCmsSnapshot(parsed.data, session.user.id);
    return Response.json({ ok: true, data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
