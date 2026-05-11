import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "CIO Agent",
  description: "Enterprise AI orchestration platform",
  manifest:    "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
