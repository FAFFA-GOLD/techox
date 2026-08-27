import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "pdf-parse"],
  outputFileTracingIncludes: {
    "/api/export/daily/pdf": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
