import { analyticsCsv, analyticsFilterSchema } from "@/lib/course-analytics";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { readCourseAnalytics } from "@/server/course-analytics";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const failure = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status, headers });
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const query = new URL(request.url).searchParams;
    if (query.toString().length > 1000) return failure("The analytics filter is too large.", 422);
    if ([...query.keys()].some((key) => !["courseId", "from", "to", "format"].includes(key) || query.getAll(key).length !== 1)) return failure("Use only one value for each supported filter.", 422);
    const format = query.get("format") || "json";
    if (!["json", "csv"].includes(format)) return failure("Choose JSON or CSV output.", 422);
    const parsed = analyticsFilterSchema.safeParse({ courseId: query.get("courseId") || "", from: query.get("from"), to: query.get("to") });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message || "Invalid analytics filters.", 422);
    const report = await readCourseAnalytics(parsed.data);
    if (!report) return failure("The selected course no longer exists. Refresh and choose another course.", 404);
    if (format === "csv") return new Response(analyticsCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="course-analytics-${parsed.data.from}-to-${parsed.data.to}.csv"` } });
    return Response.json({ ok: true, data: report }, { headers });
  } catch (error) { const response = adminErrorResponse(error); response.headers.set("Cache-Control", "private, no-store"); return response; }
}
