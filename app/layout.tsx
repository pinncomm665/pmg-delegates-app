import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PMG Delegates",
  description: "Delegate management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PMG Delegates",
  },
  other: {
    "theme-color": "#0F1117",
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
