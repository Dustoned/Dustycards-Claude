import { NextResponse } from "next/server";

export const AUTH_REQUEST_BODY_LIMIT_BYTES = 64 * 1024;
export const MAX_PASSWORD_LENGTH = 256;

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
