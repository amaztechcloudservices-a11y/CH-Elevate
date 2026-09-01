import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth";

let handler: ReturnType<typeof toNextJsHandler> | undefined;

function getHandler() {
  handler ??= toNextJsHandler(getAuth());
  return handler;
}

export function GET(request: Request) {
  return getHandler().GET(request);
}

export function POST(request: Request) {
  return getHandler().POST(request);
}
