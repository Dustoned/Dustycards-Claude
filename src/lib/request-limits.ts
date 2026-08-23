import { NextResponse } from "next/server";

export const AUTH_REQUEST_BODY_LIMIT_BYTES = 64 * 1024;
export const MAX_PASSWORD_LENGTH = 256;

export class RequestBodyLimitExceededError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "RequestBodyLimitExceededError";
  }
}

export function requestBodyTooLarge(
  request: Request,
  maxBytes: number
): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const contentLength = Number(raw);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export function requestBodyTooLargeResponse(): NextResponse {
  return NextResponse.json({ error: "Request body too large" }, { status: 413 });
}

export async function readRequestBodyWithinLimit(
  request: Request,
  maxBytes: number
): Promise<Uint8Array> {
  if (requestBodyTooLarge(request, maxBytes)) {
    throw new RequestBodyLimitExceededError();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyLimitExceededError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readAuthRequestBody<T extends Record<string, unknown>>(
  request: Request,
  maxBytes = AUTH_REQUEST_BODY_LIMIT_BYTES
): Promise<{ body: T; isFormPost: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  const bytes = await readRequestBodyWithinLimit(request, maxBytes);

  if (isFormPost) {
    try {
      const boundedRequest = new Request(request.url, {
        body: bytes.slice(),
        headers: { "content-type": contentType },
        method: "POST",
      });
      return {
        body: Object.fromEntries(await boundedRequest.formData()) as T,
        isFormPost,
      };
    } catch {
      return { body: {} as T, isFormPost };
    }
  }

  try {
    return {
      body: JSON.parse(new TextDecoder().decode(bytes)) as T,
      isFormPost,
    };
  } catch {
    return { body: {} as T, isFormPost };
  }
}
