"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { useSiteContent } from "@/lib/use-site-content";

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  const { settings } = useSiteContent();
  const [open, setOpen] = useState(false);

  return (
    <header className={`site-header ${dark ? "site-header--dark" : ""}`}>
      <div className="site-container site-header__inner">
        <Link className="brand" href="/" aria-label={`${settings.brandName} home`}>
          <BrandLogo className="brand-logo__image" priority />
        </Link>
        <nav className={`desktop-nav ${open ? "is-open" : ""}`} aria-label="Primary navigation">
          {settings.navigation.filter((item) => item.isVisible).map((item) => (
            <Link
              href={item.href}
              key={item.id}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noreferrer" : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="button button--accent header-cta" href={settings.headerCtaHref}>
          {settings.headerCtaLabel} <ArrowRight aria-hidden="true" />
        </Link>
        <button className="mobile-menu" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
