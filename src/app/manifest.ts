import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DrawToSearch",
    short_name: "DrawToSearch",
    description:
      "Sketch what you remember, add a hint, and turn it into better image search results.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcf4e8",
    theme_color: "#f16d26",
    lang: "ko-KR",
    orientation: "portrait",
    categories: ["productivity", "utilities", "photo"],
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
