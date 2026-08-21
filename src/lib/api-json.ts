import { NextResponse } from "next/server";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

export class MalformedJsonBodyError extends Error {
  constructor() {
    super("Malformed JSON body");
    this.name = "MalformedJsonBodyError";
  }
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES
): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  try {
    if (!request.body) throw new MalformedJsonBodyError();

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let body = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as T;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw error;
    throw new MalformedJsonBodyError();
  }
}

export function malformedJsonBodyResponse(error: unknown): NextResponse | null {
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  if (!(error instanceof MalformedJsonBodyError)) {
    return null;
  }

  return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
}
