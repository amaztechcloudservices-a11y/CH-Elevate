export class JsonBodyError extends Error {
  constructor(
    public readonly code: "invalid_json" | "invalid_length" | "too_large",
    public readonly status: 400 | 413,
  ) {
    super(code);
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) throw new JsonBodyError("invalid_length", 400);
    if (length > maxBytes) throw new JsonBodyError("too_large", 413);
  }

  if (!request.body) throw new JsonBodyError("invalid_json", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new JsonBodyError("too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new JsonBodyError("invalid_json", 400);
  }
}
