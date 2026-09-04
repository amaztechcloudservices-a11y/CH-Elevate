"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useSiteContent } from "@/lib/use-site-content";

type PageSlug =
  | "home"
  | "about"
  | "services"
  | "portfolio"
  | "programmes"
  | "community"
  | "faq"
  | "contact";

export function CmsReferenceHero({
  pageSlug,
  className = "",
}: {
  pageSlug: PageSlug;
  className?: string;
}) {
  const { heroSlides } = useSiteContent();
  const slides = useMemo(
    () =>
      heroSlides
        .filter((slide) => slide.pageSlug === pageSlug && slide.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [heroSlides, pageSlug],
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const slide = slides[safeIndex] ?? slides[0];

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % slides.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slide) return null;

  const isHome = pageSlug === "home";
  return (
    <section
      className={`${isHome ? "ref-hero" : "about-ref__hero"} ${className} cms-hero`}
      aria-roledescription={slides.length > 1 ? "carousel" : undefined}
      aria-label={`${pageSlug} hero`}
    >
      {slides.map((item, slideIndex) => (
        <Image
          className={`${isHome ? "ref-hero__image" : ""} cms-hero__image ${slideIndex === safeIndex ? "is-active" : ""}`}
          src={item.imageUrl}
          alt=""
          aria-hidden={slideIndex !== safeIndex}
          fill
          sizes="100vw"
          priority={slideIndex === 0}
          unoptimized
          key={item.id}
        />
      ))}
      {isHome && safeIndex === 0 && (
        <video
          className="ref-hero__video cms-hero__video"
          autoPlay
          muted
          playsInline
          preload="metadata"
          poster={slide.imageUrl}
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/videos/home-hero-walk-in.mp4" type="video/mp4" />
        </video>
      )}
      {!isHome && <div className="about-ref__hero-wash" aria-hidden="true" />}
      <div className={`${isHome ? "ref-container ref-hero__content" : "ref-container about-ref__hero-content"} cms-hero__content`}>
        {slide.eyebrow && <p className={isHome ? "ref-kicker ref-kicker--light" : "ref-kicker ref-kicker--light"}>{slide.eyebrow}</p>}
        <h1>{slide.title}</h1>
        <p className={isHome ? "ref-hero__lead" : undefined}>{slide.description}</p>
        {slide.primaryCtaLabel && slide.primaryCtaHref && (
          <Link className="ref-button" href={slide.primaryCtaHref}>{slide.primaryCtaLabel}</Link>
        )}
      </div>
      {slides.length > 1 && (
        <div className="cms-hero__controls">
          <button type="button" onClick={() => setIndex((safeIndex - 1 + slides.length) % slides.length)} aria-label="Previous hero slide"><ChevronLeft aria-hidden="true" /></button>
          <span>{safeIndex + 1} / {slides.length}</span>
          <button type="button" onClick={() => setIndex((safeIndex + 1) % slides.length)} aria-label="Next hero slide"><ChevronRight aria-hidden="true" /></button>
        </div>
      )}
    </section>
  );
}
