"use client";

import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { services } from "@/lib/site-data";
import { useSiteContent } from "@/lib/use-site-content";

export function Newsletter() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("Submitting…");
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), consent: true, source: "website-newsletter" }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (response.ok && result.ok) {
      form.reset();
      setMessage("You are subscribed. Thank you.");
    } else {
      setMessage(result.error || "Subscription could not be completed.");
    }
  }

  return (
    <section className="newsletter">
      <div className="site-container newsletter__inner">
        <Mail aria-hidden="true" />
        <h2>A concise monthly briefing for clearer business decisions.</h2>
        <form className="newsletter__form" onSubmit={submit}>
          <label className="sr-only" htmlFor="newsletter-email">Email address</label>
          <input id="newsletter-email" name="email" type="email" placeholder="Email address" required />
          <button className="button button--accent" type="submit">Subscribe <ArrowRight aria-hidden="true" /></button>
          <p role="status">{message}</p>
        </form>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const { settings } = useSiteContent();
  const phoneHref = settings.footerPhone.replace(/[^\d+]/g, "");

  return (
    <footer className="site-footer">
      <div className="site-container footer-grid">
        <div className="footer-brand">
          <Link className="brand brand--footer" href="/">
            <span className="brand__mark" aria-hidden="true"><span /></span>
            <span className="brand__name">{settings.brandName} <small>{settings.brandTagline}</small></span>
          </Link>
          <p>{settings.footerSummary}</p>
          {settings.socialLinks.filter((item) => item.isVisible).map((item) => (
            <a href={item.href} aria-label={item.label} key={item.id} target={item.newTab ? "_blank" : undefined} rel={item.newTab ? "noreferrer" : undefined}>
              <strong aria-hidden="true">{item.label.slice(0, 2).toLowerCase()}</strong>
            </a>
          ))}
        </div>
        <div>
          <h2>Services</h2>
          <ul>{services.slice(0, 5).map((service) => <li key={service.slug}><Link href={`/services/${service.slug}`}>{service.title}</Link></li>)}</ul>
        </div>
        <div>
          <h2>Company</h2>
          <ul>{settings.footerCompanyLinks.filter((item) => item.isVisible).map((item) => <li key={item.id}><Link href={item.href}>{item.label}</Link></li>)}</ul>
        </div>
        <div>
          <h2>Contact</h2>
          <ul className="footer-contact">
            <li><MapPin aria-hidden="true" /> {settings.footerAddress.replace("\n", ", ")}</li>
            <li><Phone aria-hidden="true" /> <a href={`tel:${phoneHref}`}>{settings.footerPhone}</a></li>
            <li><Mail aria-hidden="true" /> <a href={`mailto:${settings.footerEmail}`}>{settings.footerEmail}</a></li>
          </ul>
        </div>
      </div>
      <div className="site-container footer-legal">
        <p>{settings.copyright}</p>
        <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      </div>
    </footer>
  );
}
