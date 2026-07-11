import { NextResponse } from "next/server";

export class MalformedJsonBodyError extends Error {
  constructor() {
    super("Malformed JSON body");
    this.name = "MalformedJsonBodyError";
  }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new MalformedJsonBodyError();
  }
}

export function malformedJsonBodyResponse(error: unknown): NextResponse | null {
  if (!(error instanceof MalformedJsonBodyError)) {
    return null;
  }

  return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
}
