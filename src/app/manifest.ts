import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DustyCards",
    short_name: "DustyCards",
    description: "Track, value and research your trading card collection.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07080B",
    theme_color: "#07080B",
    categories: ["shopping", "finance", "utilities"],
    icons: [
      {
        src: "/icons/dustycards-pokeball-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/dustycards-pokeball-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/dustycards-pokeball-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
