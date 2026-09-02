"use client";

import { Headphones, Mail, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { useSiteContent } from "@/lib/use-site-content";

const footerServices = [
  ["PMO consultancy", "/services#pmo"],
  ["Process efficiency", "/services#process"],
  ["Coaching support", "/services#coaching"],
  ["Training programmes", "/programmes#masterclasses"],
  ["Executive programmes", "/programmes#individual"],
  ["Community membership", "/community"],
];

type ActivePage =
  | "home"
  | "about"
  | "services"
  | "portfolio"
  | "programmes"
  | "community"
  | "faq"
  | "contact";

export function ReferenceHeader({ active }: { active?: ActivePage }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { settings } = useSiteContent();
  const pathname = usePathname();

  useEffect(() => {
    const updateHeaderState = () => setIsScrolled(window.scrollY > 24);

    updateHeaderState();
    window.addEventListener("scroll", updateHeaderState, { passive: true });
    return () => window.removeEventListener("scroll", updateHeaderState);
  }, []);
  const inferredActive: ActivePage | undefined = pathname === "/"
    ? "home"
    : pathname.startsWith("/about")
      ? "about"
      : pathname.startsWith("/services")
        ? "services"
        : pathname.startsWith("/portfolio") || pathname.startsWith("/projects")
          ? "portfolio"
          : pathname.startsWith("/programmes")
            ? "programmes"
            : pathname.startsWith("/community")
              ? "community"
              : pathname.startsWith("/faq")
                ? "faq"
                : pathname.startsWith("/contact")
                  ? "contact"
                  : undefined;
  const activePage = active ?? inferredActive;

  return (
    <header className={`ref-header ${isScrolled ? "is-scrolled" : ""}`}>
      <div className="ref-container ref-header__inner">
        <Link className="ref-logo" href="/" aria-label={`${settings.brandName} home`}>
          <BrandLogo className="brand-logo__image" priority />
        </Link>
        <nav
          id="ref-primary-navigation"
          className={`ref-nav ${menuOpen ? "is-open" : ""}`}
          aria-label="Primary navigation"
        >
          {settings.navigation.filter((item) => item.isVisible).map((item) => {
            const itemPage = item.href === "/" ? "home" : item.href.slice(1);
            return (
              <Link
                className={activePage === itemPage ? "active" : undefined}
                href={item.href}
                key={item.id}
                target={item.newTab ? "_blank" : undefined}
                rel={item.newTab ? "noreferrer" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link className="ref-button ref-button--small" href={settings.headerCtaHref}>
          {settings.headerCtaLabel}
        </Link>
        <button
          className="ref-menu"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="ref-primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

export function ReferenceNewsletter() {
  const { forms } = useSiteContent();
  const newsletter = forms.find((form) => form.key === "newsletter");
  const [status, setStatus] = useState<{
    kind: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus({ kind: "submitting", message: "Signing you up…" });

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          consent: true,
          source: "website-newsletter",
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "We could not complete the signup.");
      }

      form.reset();
      setStatus({
        kind: "success",
        message: "You are subscribed. Thank you.",
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not complete the signup.",
      });
    }
  }

  return (
    <section className="ref-newsletter">
      <div className="ref-container ref-newsletter__inner">
        <h2>Join the CH Elevate briefing for practical ideas, tools, and upcoming events.</h2>
        <form onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="ref-newsletter-email">Email address</label>
          <input id="ref-newsletter-email" type="email" name="email" placeholder="Email" required />
          <button className="ref-button" type="submit" disabled={status.kind === "submitting"}>
            <Mail aria-hidden="true" /> {status.kind === "submitting" ? "Signing up…" : (newsletter?.submitLabel ?? "Sign up")}
          </button>
          <p
            className={`ref-newsletter__status ref-newsletter__status--${status.kind}`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </p>
        </form>
      </div>
    </section>
  );
}

export function ReferenceFooter() {
  const { settings } = useSiteContent();
  const phoneHref = settings.footerPhone.replace(/[^\d+]/g, "");
  const hasDialablePhone = phoneHref.replace(/\D/g, "").length >= 7;

  return (
    <footer className="ref-footer">
      <div className="ref-container ref-footer__grid">
        <div className="ref-footer__brand">
          <Link className="ref-logo ref-logo--footer" href="/">
            <BrandLogo className="brand-logo__image" />
          </Link>
          <p>{settings.footerSummary}</p>
          <div className="ref-footer__help">
            <Headphones aria-hidden="true" />
            <span>Need help? Contact us<strong>{hasDialablePhone ? <a href={`tel:${phoneHref}`}>{settings.footerPhone}</a> : settings.footerPhone}</strong></span>
          </div>
        </div>
        <div>
          <h2>Services</h2>
          <ul>{footerServices.map(([label, href]) => <li key={label}><Link href={href}>{label}</Link></li>)}</ul>
        </div>
        <div>
          <h2>Company</h2>
          <ul>{settings.footerCompanyLinks.filter((item) => item.isVisible).map((item) => (
            <li key={item.id}>
              <Link href={item.href} target={item.newTab ? "_blank" : undefined} rel={item.newTab ? "noreferrer" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}</ul>
        </div>
        <div>
          <h2>Get in touch</h2>
          <address>{settings.footerAddress.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</address>
          <a href={`mailto:${settings.footerEmail}`}>{settings.footerEmail}</a>
          {hasDialablePhone ? <a href={`tel:${phoneHref}`}>{settings.footerPhone}</a> : <span>{settings.footerPhone}</span>}
          <div className="ref-footer__socials" aria-label="Social media">
            {settings.socialLinks.filter((item) => item.isVisible).map((item) => (
              <a href={item.href} key={item.id} aria-label={item.label} target={item.newTab ? "_blank" : undefined} rel={item.newTab ? "noreferrer" : undefined}>
                {item.label.slice(0, 2).toLowerCase()}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="ref-container ref-footer__legal">
        <p>{settings.copyright}</p>
        <div>
          <Link href="/terms">Terms and Conditions</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/refund-policy">Refund Policy</Link>
          <Link href="/data-protection">Data Protection</Link>
        </div>
      </div>
    </footer>
  );
}
