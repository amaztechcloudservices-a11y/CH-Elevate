import type { Metadata } from "next";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/sora";

import { Toaster } from "@/components/ui/sonner";
import { SiteMotion } from "@/components/site-motion";
import { GlobalSiteChrome } from "@/components/global-site-chrome";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CH Elevate Consultancy Limited",
    template: "%s | CH Elevate",
  },
  description:
    "PMO consultancy, process efficiency, coaching, training, and implementation support for organisations ready to deliver measurable change.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <GlobalSiteChrome>{children}</GlobalSiteChrome>
        <SiteMotion />
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
