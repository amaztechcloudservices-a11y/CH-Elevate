export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "premium-fullstack-next",
    timestamp: new Date().toISOString(),
  });
}
