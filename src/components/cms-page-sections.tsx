"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { useSiteContent } from "@/lib/use-site-content";

export function CmsPageSections({ pageSlug }: { pageSlug: string }) {
  const { pages } = useSiteContent();
  const page = pages.find((item) => item.slug === pageSlug);
  if (!page?.isPublished) return null;

  return (
    <div className="cms-public-sections" data-cms-page={pageSlug}>
      {page.sections.filter((section) => section.isVisible).map((section) => (
        <section
          className={`cms-public-section cms-public-section--${section.type}`}
          data-cms-section={section.id}
          key={section.id}
        >
          {section.imageUrl && (
            <div
              className="cms-public-section__image"
              style={{ backgroundImage: `url("${section.imageUrl.replaceAll('"', "%22")}")` }}
              aria-hidden="true"
            />
          )}
          <div className="ref-container cms-public-section__inner">
            {section.eyebrow && <p className="ref-kicker">{section.eyebrow}</p>}
            {section.heading && <h2>{section.heading}</h2>}
            {section.body && <p>{section.body}</p>}
            {section.items.length > 0 && (
              <div className="cms-public-section__items">
                {section.items.map((item) => (
                  <article key={item.id}>
                    {/* Administrators may supply either local media paths or approved remote media. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.imageUrl && <img src={item.imageUrl} alt="" />}
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    {item.href && <Link href={item.href}>Learn more <ArrowRight aria-hidden="true" /></Link>}
                  </article>
                ))}
              </div>
            )}
            {section.ctaLabel && section.ctaHref && (
              <Link className="ref-button" href={section.ctaHref}>
                {section.ctaLabel} <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
