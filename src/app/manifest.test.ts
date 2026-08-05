import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("launches inside a dark, standalone, full-scope app shell", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: "DustyCards",
      short_name: "DustyCards",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#07080B",
      theme_color: "#07080B",
    });
  });

  it("publishes installable and maskable opaque PNG artwork", () => {
    const icons = manifest().icons ?? [];

    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/dustycards-pokeball-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icons/dustycards-pokeball-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icons/dustycards-pokeball-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ])
    );
  });
});
