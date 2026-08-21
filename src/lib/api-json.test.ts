import { describe, expect, it } from "vitest";
import {
  MalformedJsonBodyError,
  RequestBodyTooLargeError,
  malformedJsonBodyResponse,
  readJsonBody,
} from "./api-json";

describe("readJsonBody", () => {
  it("parses valid JSON", async () => {
    const body = await readJsonBody<{ ok: boolean }>(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ ok: true }),
      })
    );

    expect(body).toEqual({ ok: true });
  });

  it("turns invalid JSON into a typed error", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost/api", {
          method: "POST",
          body: "{nope",
        })
      )
    ).rejects.toBeInstanceOf(MalformedJsonBodyError);
  });

  it("rejects oversized streamed JSON before parsing", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ value: "too large" }),
        }),
        8
      )
    ).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});

describe("malformedJsonBodyResponse", () => {
  it("returns a 400 response for malformed JSON errors", async () => {
    const response = malformedJsonBodyResponse(new MalformedJsonBodyError());

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({ error: "Malformed JSON body" });
  });

  it("ignores unrelated errors", () => {
    expect(malformedJsonBodyResponse(new Error("Other"))).toBeNull();
  });

  it("returns 413 for oversized request bodies", async () => {
    const response = malformedJsonBodyResponse(new RequestBodyTooLargeError());

    expect(response?.status).toBe(413);
    await expect(response?.json()).resolves.toEqual({ error: "Request body too large" });
  });
});
