import { afterEach, expect, test, vi } from "vitest";
import type { Texture, TextureLoader } from "three";
import { loadCardTexture } from "./load-card-texture";

afterEach(() => vi.useRealTimers());

function fixture() {
  const texture = { dispose: vi.fn() } as unknown as Texture;
  let ready: (texture: Texture) => void;
  let failed: (error: unknown) => void;
  const loader = { load: vi.fn((_url, onLoad, _progress, onError) => { ready = onLoad; failed = onError; return texture; }) } as unknown as TextureLoader;
  return { texture, loader, ready: () => ready(texture), fail: () => failed(new Error("Image unavailable")) };
}

test("a stalled texture times out and disposes a late arrival", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const result = expect(loadCardTexture(f.loader, "/card.png", new AbortController().signal, 100)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(100);
  await result;
  f.ready();
  expect(f.texture.dispose).toHaveBeenCalled();
});

test("leaving the viewer cancels pending texture loading", async () => {
  const f = fixture();
  const abort = new AbortController();
  const result = expect(loadCardTexture(f.loader, "/card.png", abort.signal)).rejects.toThrow("cancelled");
  abort.abort();
  await result;
  expect(f.texture.dispose).toHaveBeenCalled();
});

test("successful textures remain usable and source errors reject", async () => {
  const f = fixture();
  const abort = new AbortController();
  const result = loadCardTexture(f.loader, "/card.png", abort.signal);
  f.ready();
  expect(await result).toBe(f.texture);
  abort.abort();
  expect(f.texture.dispose).not.toHaveBeenCalled();
  const broken = fixture();
  const failure = expect(loadCardTexture(broken.loader, "/broken.png", new AbortController().signal)).rejects.toThrow("Image unavailable");
  broken.fail();
  await failure;
});
