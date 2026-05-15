import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Future-proof dev warning (LAN testing on phone/tablet)
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://192.168.1.4:3000",
  ],

  // Remote images (Unsplash/Pravatar etc.)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "api.mapbox.com" },
    ],
  },
};

export default nextConfig;