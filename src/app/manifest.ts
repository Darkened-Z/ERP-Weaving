import type { MetadataRoute } from "next";

// Lets Chrome / Edge install the ERP as a desktop app (own window, taskbar
// icon). Served at /manifest.webmanifest, which the auth proxy leaves open like
// every other root file with an extension — the browser fetches it before login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SK Weaving Mills",
    short_name: "SK Mills",
    description: "Weaving Mill ERP System",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2c3e6b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
