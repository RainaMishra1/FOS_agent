import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/agent/dashboard",
    name: "FOS Agent — Field Operations",
    short_name: "FOS Agent",
    description: "Visits, navigation and geofenced check-ins for field agents.",
    start_url: "/agent/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F2EB",
    theme_color: "#1E3F35",
    categories: ["business", "productivity", "navigation"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My Visits", url: "/agent/visits", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My Routes", url: "/agent/routes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
