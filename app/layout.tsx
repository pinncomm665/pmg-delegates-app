import "./globals.css";
import type { Metadata } from "next";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
