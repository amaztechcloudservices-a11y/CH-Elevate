"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ReferenceFooter, ReferenceHeader } from "@/components/reference-site";

const solidHeaderRoutes = [
  "/admin",
  "/portal",
  "/certificates",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/data-protection",
  "/book/confirmation",
];

export function GlobalSiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const usesSolidHeader = solidHeaderRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return (
    <div className={`global-site-shell elevate-site ${usesSolidHeader ? "global-site-shell--solid" : "global-site-shell--overlay"}`}>
      <ReferenceHeader />
      <div className="global-site-shell__content">{children}</div>
      <ReferenceFooter />
    </div>
  );
}
