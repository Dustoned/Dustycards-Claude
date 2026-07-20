import { promisify } from "node:util";
import { constants, gzip } from "node:zlib";

const gzipAsync = promisify(gzip);
const MINIMUM_COMPRESSION_BYTES = 1024;

function acceptsGzip(value: string | null): boolean {
  if (!value) return false;

  return value.split(",").some((entry) => {
    const [rawEncoding, ...parameters] = entry.trim().toLowerCase().split(";");
    if (rawEncoding !== "gzip" && rawEncoding !== "*") return false;

    const quality = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith("q="));
    return quality ? Number(quality.slice(2)) > 0 : true;
  });
}

function appendVary(headers: Headers, value: string) {
  const current = headers.get("Vary");
  const values = new Set(
    (current ? current.split(",") : []).map((entry) => entry.trim()).filter(Boolean)
  );
  values.add(value);
  headers.set("Vary", Array.from(values).join(", "));
}

export async function compressedJsonResponse(
  request: Request,
  payload: unknown,
  init: ResponseInit = {}
): Promise<Response> {
  const json = JSON.stringify(payload);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  appendVary(headers, "Accept-Encoding");

  if (
    Buffer.byteLength(json) >= MINIMUM_COMPRESSION_BYTES &&
    acceptsGzip(request.headers.get("Accept-Encoding"))
  ) {
    const compressed = await gzipAsync(Buffer.from(json), {
      level: constants.Z_BEST_SPEED,
    });
    headers.set("Content-Encoding", "gzip");

    return new Response(new Uint8Array(compressed), {
      ...init,
      headers,
    });
  }

  return new Response(json, {
    ...init,
    headers,
  });
}
