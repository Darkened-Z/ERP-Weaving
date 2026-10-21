import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Weaving Mill ERP System",
  applicationName: BRAND.name,
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: BRAND.short, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2c3e6b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // en-GB, not en: the browser renders <input type="date"> in the document's
  // locale, and plain "en" gives the US MM/DD/YYYY order. The mill reads
  // day-first (01-09-26), so every date box across the app must show
  // DD/MM/YYYY. The stored value is ISO either way, so nothing else moves.
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
