import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "amplifica",
  description: "Quiet systems for lasting wealth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-ink">{children}</body>
    </html>
  );
}
