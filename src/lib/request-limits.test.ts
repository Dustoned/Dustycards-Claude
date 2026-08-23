import { describe, expect, it } from "vitest";
import {
  readAuthRequestBody,
  readRequestBodyWithinLimit,
  RequestBodyLimitExceededError,
} from "@/lib/request-limits";

describe("request body limits", () => {
  it("rejects an oversized streamed body without trusting Content-Length", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      body: "x".repeat(33),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(request.headers.get("content-length")).toBeNull();
    await expect(readRequestBodyWithinLimit(request, 32)).rejects.toBeInstanceOf(
      RequestBodyLimitExceededError
    );
  });

  it("rejects a body that is larger than a deceptive Content-Length header", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      body: "x".repeat(33),
      headers: {
        "content-length": "1",
        "content-type": "application/json",
      },
      method: "POST",
    });

    await expect(readRequestBodyWithinLimit(request, 32)).rejects.toBeInstanceOf(
      RequestBodyLimitExceededError
    );
  });

  it("parses bounded JSON and form bodies without buffering the original request twice", async () => {
    const json = await readAuthRequestBody<{ email?: unknown }>(
      new Request("http://localhost/api/auth/login", {
        body: JSON.stringify({ email: "json@example.com" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    const form = await readAuthRequestBody<{ email?: unknown }>(
      new Request("http://localhost/api/auth/login", {
        body: new URLSearchParams({ email: "form@example.com" }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      })
    );

    expect(json).toEqual({ body: { email: "json@example.com" }, isFormPost: false });
    expect(form).toEqual({ body: { email: "form@example.com" }, isFormPost: true });
  });
});
