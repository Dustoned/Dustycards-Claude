import type { Texture, TextureLoader } from "three";

/** End stalled requests and dispose textures that arrive after leaving the viewer. */
export function loadCardTexture(loader: TextureLoader, url: string, signal: AbortSignal, timeoutMs = 15_000): Promise<Texture> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pending: Texture | undefined;
    const finish = () => {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      finish();
      pending?.dispose();
      reject(error);
    };
    const abort = () => fail(new Error("Texture loading cancelled"));
    const timer = setTimeout(() => fail(new Error("Texture loading timed out")), timeoutMs);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    try {
      pending = loader.load(url, (texture) => {
        if (settled) { texture.dispose(); return; }
        finish();
        resolve(texture);
      }, undefined, fail);
    } catch (error) {
      fail(error);
    }
  });
}
