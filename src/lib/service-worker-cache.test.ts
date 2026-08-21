import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

interface WorkerFetchEvent {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
}

type WorkerHandler = (event: WorkerFetchEvent) => void;

function loadServiceWorker(cache: {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
  keys: () => Promise<Request[]>;
  delete: (request: Request) => Promise<boolean>;
}) {
  const handlers = new Map<string, WorkerHandler>();
  const source = readFileSync(
    path.join(process.cwd(), "public", "dustycards-sw.js"),
    "utf8"
  );
  const fetchMock = vi.fn(async () =>
    new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { "Content-Type": "image/png" },
    })
  );

  vm.runInNewContext(source, {
    self: {
      location: { origin: "https://dustycards.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (type: string, handler: WorkerHandler) => {
        handlers.set(type, handler);
      },
    },
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    },
    fetch: fetchMock,
    URL,
    Response,
    Request,
    Map,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  });

  const fetchHandler = handlers.get("fetch");
  if (!fetchHandler) throw new Error("Service worker did not register a fetch handler");
  const handleFetch = fetchHandler;

  function dispatchImageRequest() {
    const background: Promise<unknown>[] = [];
    let responsePromise: Promise<Response> | null = null;
    const request = new Request(
      "https://dustycards.test/api/image-cache?url=https%3A%2F%2Fassets.tcgdex.net%2Fcard.webp",
      { method: "GET" }
    );

    handleFetch({
      request,
      respondWith(response) {
        responsePromise = Promise.resolve(response);
      },
      waitUntil(promise) {
        background.push(promise);
      },
    });

    if (!responsePromise) throw new Error("Service worker did not respond to image request");
    return { background, responsePromise: responsePromise as Promise<Response> };
  }

  function dispatchPageRequest(preloadResponse?: Promise<Response | undefined>) {
    const background: Promise<unknown>[] = [];
    let responsePromise: Promise<Response> | null = null;
    const request = {
      method: "GET",
      url: "https://dustycards.test/",
      mode: "navigate",
      destination: "document",
      cache: "default",
    } as Request;

    handleFetch({
      request,
      preloadResponse,
      respondWith(response) {
        responsePromise = Promise.resolve(response);
      },
      waitUntil(promise) {
        background.push(promise);
      },
    } as WorkerFetchEvent & { preloadResponse?: Promise<Response | undefined> });

    return { background, responsePromise };
  }

  return { dispatchImageRequest, dispatchPageRequest, fetchMock };
}

describe("DustyCards service-worker image cache", () => {
  it("returns a network image before the cache write finishes", async () => {
    let finishWrite: (() => void) | undefined;
    const writeGate = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(() => writeGate),
      keys: vi.fn(async () => [] as Request[]),
      delete: vi.fn(async () => true),
    };
    const { dispatchImageRequest } = loadServiceWorker(cache);
    const request = dispatchImageRequest();

    const firstToSettle = await Promise.race([
      request.responsePromise.then(() => "response"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 250)),
    ]);

    expect(firstToSettle).toBe("response");
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.keys).not.toHaveBeenCalled();

    finishWrite?.();
    await Promise.all(request.background);
  });

  it("serves cache hits without delete-and-put LRU churn", async () => {
    const cache = {
      match: vi.fn(async () =>
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { "Content-Type": "image/png" },
        })
      ),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => [] as Request[]),
      delete: vi.fn(async () => true),
    };
    const { dispatchImageRequest, fetchMock } = loadServiceWorker(cache);
    const request = dispatchImageRequest();

    await request.responsePromise;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.keys).not.toHaveBeenCalled();
  });

  it("only scans cache keys after a batch of writes", async () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => [] as Request[]),
      delete: vi.fn(async () => true),
    };
    const { dispatchImageRequest } = loadServiceWorker(cache);

    for (let index = 0; index < 31; index += 1) {
      const request = dispatchImageRequest();
      await request.responsePromise;
      await Promise.all(request.background);
    }
    expect(cache.keys).not.toHaveBeenCalled();

    const thresholdRequest = dispatchImageRequest();
    await thresholdRequest.responsePromise;
    await Promise.all(thresholdRequest.background);
    expect(cache.keys).toHaveBeenCalledTimes(1);
  });
});

describe("DustyCards service-worker page privacy", () => {
  it("does not intercept or cache authenticated page navigations", () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => [] as Request[]),
      delete: vi.fn(async () => true),
    };
    const { dispatchPageRequest, fetchMock } = loadServiceWorker(cache);
    const request = dispatchPageRequest();

    expect(request.responsePromise).toBeNull();
    expect(request.background).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
