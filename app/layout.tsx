import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./fonts.css";
import "./globals.css";
import { brand } from "./theme/brand";
import { Toaster } from "./ui/Toaster";

export const metadata: Metadata = { title: brand.title, description: brand.pitch };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="text-ink antialiased selection:bg-accent/30 selection:text-white">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
