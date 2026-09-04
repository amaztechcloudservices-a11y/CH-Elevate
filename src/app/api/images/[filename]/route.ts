import { publicImageResponse } from "@/server/public-image-storage";

export const runtime = "nodejs";

type ImageRouteContext = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: ImageRouteContext) {
  const { filename } = await context.params;
  return publicImageResponse(filename);
}

export async function HEAD(_request: Request, context: ImageRouteContext) {
  const { filename } = await context.params;
  return publicImageResponse(filename, "HEAD");
}
