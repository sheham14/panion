import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Panion — Grocery Price Intelligence",
    short_name: "Panion",
    description:
      "Compare grocery prices across St. John's stores. Track your pantry, manage lists, and get AI meal suggestions.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1416",
    theme_color: "#00E5C3",
    orientation: "portrait",
    categories: ["food", "shopping", "lifestyle"],
    icons: [
      {
        src: "/api/icons/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/api/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
