import { getCmsSnapshot } from "@/server/cms";

export async function GET() {
  const snapshot = await getCmsSnapshot();

  return Response.json(
    { ok: true, data: snapshot },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
