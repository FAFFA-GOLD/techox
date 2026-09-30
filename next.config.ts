import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdfjs-dist",
    "pdfkit",
    "pdf-parse",
  ],
  outputFileTracingIncludes: {
    "/api/export/daily/pdf": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
