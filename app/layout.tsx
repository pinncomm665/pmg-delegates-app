import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";

// One real UI face, self-hosted at build time — no runtime request to Google,
// and no reliance on whatever the viewer's OS happens to supply.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});


export const metadata: Metadata = {
  title: "PMG Delegates",
  description: "Delegate management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PMG Delegates",
  },
  other: {
    "theme-color": "#f7f7f5",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
