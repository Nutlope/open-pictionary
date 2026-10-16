import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { bricolage } from "@/lib/fonts";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${BRAND.name} · draw, and seven AI models race to guess it`,
  description:
    "Draw a word and watch seven open vision models (Kimi K3, DeepSeek V4.1, Qwen3.8 Flash, Muse Spark, GLM-5.3, MiniMax M3, Nemotron 3.5 Super) guess live. First correct guess wins. Free to play.",
  openGraph: { title: BRAND.name, description: BRAND.tagline, type: "website" },
  twitter: { card: "summary_large_image", title: BRAND.name, description: BRAND.tagline },
};

export const viewport: Viewport = {
  themeColor: "#ffd84a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body>
        {children}
        {/* Plausible: cookieless page views, from the production site only, so previews and local runs never count. */}
        {process.env.VERCEL_ENV === "production" && <Script defer data-domain="openpictionary.com" src="https://plausible.io/js/script.js" strategy="afterInteractive" />}
      </body>
    </html>
  );
}
