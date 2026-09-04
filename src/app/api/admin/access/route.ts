import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    return Response.json({ ok: true });
  } catch (error) { return adminErrorResponse(error); }
}
