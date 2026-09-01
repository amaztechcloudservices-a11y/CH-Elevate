import type { Metadata } from "next";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/sora";

import { Toaster } from "@/components/ui/sonner";
import { SiteMotion } from "@/components/site-motion";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CH Elevate Consultancy Limited",
    template: "%s | CH Elevate",
  },
  description:
    "PMO consultancy, process efficiency, coaching, training, and implementation support for organisations ready to deliver measurable change.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <SiteMotion />
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
