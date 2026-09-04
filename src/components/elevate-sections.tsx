import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Quote } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CmsPageSections } from "@/components/cms-page-sections";
import { CmsReferenceHero } from "@/components/cms-reference-hero";
import { CourseRegistration } from "@/components/course-registration";
import {
  ReferenceNewsletter,
} from "@/components/reference-site";

export type ElevatePageSlug =
  | "home"
  | "about"
  | "services"
  | "portfolio"
  | "programmes"
  | "community"
  | "faq"
  | "contact";

export function ElevatePageShell({
  pageSlug,
  children,
  className = "",
  newsletter = true,
}: {
  pageSlug: ElevatePageSlug;
  children: ReactNode;
  className?: string;
  newsletter?: boolean;
}) {
  return (
    <div className={`busima-home elevate-site ${className}`.trim()}>
      <CmsReferenceHero pageSlug={pageSlug} className="elevate-hero" />
      <main>{children}<CourseRegistration pageSlug={pageSlug} /></main>
      <CmsPageSections pageSlug={pageSlug} />
      {newsletter && <ReferenceNewsletter />}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <header className={`elevate-heading elevate-heading--${align}`}>
      {eyebrow && <p className="ref-kicker">{eyebrow}</p>}
      <h2>{title}</h2>
      {intro && <div className="elevate-heading__intro">{intro}</div>}
    </header>
  );
}

export function IconCards({
  items,
  columns = 3,
}: {
  items: {
    icon: LucideIcon;
    title: string;
    body: string;
    bullets?: string[];
    href?: string;
    label?: string;
    dark?: boolean;
  }[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className={`elevate-card-grid elevate-card-grid--${columns}`}>
      {items.map(({ icon: Icon, title, body, bullets, href, label, dark }) => {
        const content = (
          <>
            <span className="elevate-card__icon"><Icon aria-hidden="true" /></span>
            <h3>{title}</h3>
            <p>{body}</p>
            {bullets && (
              <ul>
                {bullets.map((bullet) => <li key={bullet}><Check aria-hidden="true" />{bullet}</li>)}
              </ul>
            )}
            {href && <span className="elevate-card__link">{label ?? "Learn more"} <ArrowRight aria-hidden="true" /></span>}
          </>
        );
        return href ? (
          <Link className={dark ? "is-dark" : undefined} href={href} key={title}>{content}</Link>
        ) : (
          <article className={dark ? "is-dark" : undefined} key={title}>{content}</article>
        );
      })}
    </div>
  );
}

export function StatsBand({
  title,
  items,
  note,
  light = false,
}: {
  title?: string;
  items: { value: string; label: string }[];
  note?: string;
  light?: boolean;
}) {
  return (
    <section className={`elevate-stats ${light ? "elevate-stats--light" : ""}`.trim()}>
      <div className="ref-container">
        {title && <h2>{title}</h2>}
        <div className="elevate-stats__grid">
          {items.map((item) => (
            <article key={`${item.value}-${item.label}`}>
              <strong data-counter>{item.value}</strong>
              <p>{item.label}</p>
            </article>
          ))}
        </div>
        {note && <p className="elevate-stats__note">{note}</p>}
      </div>
    </section>
  );
}

export function ProcessSteps({
  items,
}: {
  items: { number: string; title: string; body: string }[];
}) {
  return (
    <div className="elevate-process">
      {items.map((item) => (
        <article key={item.number}>
          <span>{item.number}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export function SplitFeature({
  image,
  imageAlt = "",
  reverse = false,
  children,
}: {
  image: string;
  imageAlt?: string;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`elevate-split ${reverse ? "elevate-split--reverse" : ""}`}>
      <div className="elevate-split__media">
        <Image src={image} alt={imageAlt} fill sizes="(max-width: 900px) 100vw, 50vw" />
      </div>
      <div className="elevate-split__content">{children}</div>
    </div>
  );
}

export function QuoteBand({
  title,
  quote,
  attribution,
  illustrative = false,
  stats,
}: {
  title?: string;
  quote: string;
  attribution: string;
  illustrative?: boolean;
  stats?: { value: string; label: string }[];
}) {
  return (
    <section className="elevate-quote">
      <div className="ref-container elevate-quote__inner">
        <Quote aria-hidden="true" />
        {title && <h2>{title}</h2>}
        {illustrative && <span className="elevate-disclosure">Illustrative example</span>}
        <blockquote>{quote}</blockquote>
        <p>{attribution}</p>
        {stats && (
          <div className="elevate-quote__stats">
            {stats.map((stat) => <article key={stat.value}><strong>{stat.value}</strong><span>{stat.label}</span></article>)}
          </div>
        )}
      </div>
    </section>
  );
}

export function CtaBand({
  title,
  body,
  primary = { label: "Book a discovery call", href: "/book" },
  secondary,
}: {
  title: string;
  body: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="elevate-cta">
      <div className="ref-container elevate-cta__inner">
        <div><h2>{title}</h2><p>{body}</p></div>
        <div className="elevate-actions">
          <Link className="ref-button" href={primary.href}>{primary.label}<ArrowRight aria-hidden="true" /></Link>
          {secondary && <Link className="elevate-button-secondary" href={secondary.href}>{secondary.label}</Link>}
        </div>
      </div>
    </section>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="elevate-checklist">
      {items.map((item) => <li key={item}><Check aria-hidden="true" /><span>{item}</span></li>)}
    </ul>
  );
}

export function MethodBadges({ items }: { items: string[] }) {
  return (
    <div className="elevate-methods">
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}
