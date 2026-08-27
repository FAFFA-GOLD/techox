import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { BRAND_NAME, BRAND_READING, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const notoSans = Noto_Sans_JP({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: `${BRAND_NAME}（${BRAND_READING}）`,
  description: BRAND_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSans.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
