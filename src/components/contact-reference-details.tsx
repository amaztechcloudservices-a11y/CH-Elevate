"use client";

import { Mail, MapPin, Phone } from "lucide-react";

import { useSiteContent } from "@/lib/use-site-content";

export function ContactReferenceDetails() {
  const { settings } = useSiteContent();
  const phoneHref = settings.footerPhone.replace(/[^\d+]/g, "");
  const hasDialablePhone = phoneHref.replace(/\D/g, "").length >= 7;

  return (
    <aside className="contact-ref__details">
      <h2>How to reach us</h2>
      <p className="contact-ref__intro">Reach out and expect a response within one business day.</p>
      <div className="contact-ref__rule" aria-hidden="true" />
      <ul className="contact-ref__list">
        <li>
          <span className="contact-ref__icon"><MapPin aria-hidden="true" /></span>
          <div><h3>Headquarters</h3><address>{settings.footerAddress}</address></div>
        </li>
        <li>
          <span className="contact-ref__icon"><Mail aria-hidden="true" /></span>
          <div><h3>Email us</h3><a href={`mailto:${settings.footerEmail}`}>{settings.footerEmail}</a></div>
        </li>
        <li>
          <span className="contact-ref__icon"><Phone aria-hidden="true" /></span>
          <div>
            <h3>Call us</h3>
            {hasDialablePhone ? <a href={`tel:${phoneHref}`}>{settings.footerPhone}</a> : <span>{settings.footerPhone}</span>}
            <span>Monday to Friday, 8:00 AM to 6:00 PM GMT</span>
          </div>
        </li>
      </ul>
      <div className="contact-ref__rule" aria-hidden="true" />
      <div className="contact-ref__socials" aria-label="Social media">
        {settings.socialLinks.filter((item) => item.isVisible).map((item) => (
          <a href={item.href} aria-label={item.label} key={item.id} target={item.newTab ? "_blank" : undefined} rel={item.newTab ? "noreferrer" : undefined}>
            <span aria-hidden="true">{item.label.slice(0, 2).toLowerCase()}</span>
          </a>
        ))}
      </div>
    </aside>
  );
}

export function ContactReferenceMap() {
  const { settings } = useSiteContent();

  return (
    <section className="contact-ref__map" aria-label="CH Elevate headquarters location">
      <iframe
        title="Map showing CH Elevate headquarters"
        src={settings.mapEmbedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="contact-ref__map-card">
        <strong>{settings.brandName}</strong>
        <span>{settings.footerAddress.replace("\n", ", ")}</span>
        <a href={settings.mapDirectionsUrl} target="_blank" rel="noreferrer">View larger map</a>
      </div>
    </section>
  );
}
