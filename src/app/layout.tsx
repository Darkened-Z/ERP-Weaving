import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SK Weaving Mills",
  description: "Weaving Mill ERP System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    {/* en-GB, not en: the browser renders <input type="date"> in the document's
        locale, and plain "en" gives the US MM/DD/YYYY order. The mill reads
        day-first (01-09-26), so every date box across the app must show
        DD/MM/YYYY. The stored value is ISO either way, so nothing else moves. */}
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
