"use client";

import { gsap } from "gsap";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const cardSelector = [
  ".ref-service-grid > a",
  ".ref-proof__grid > article",
  ".ref-hero-services > article",
  ".ref-values__list > article",
  ".portfolio-ref__project",
  ".faq-ref__articles article",
  ".contact-ref__details",
  ".contact-ref__message",
  ".pricing-card",
  ".elevate-card-grid > article",
  ".elevate-card-grid > a",
  ".elevate-process > article",
  ".elevate-story > article",
  ".elevate-team-grid > article",
  ".elevate-case-feature > div",
  ".elevate-testimonials blockquote",
  ".elevate-programme-features > article",
  ".elevate-pricing-grid > article",
  ".elevate-events > article",
  ".elevate-location-grid > article",
].join(",");

const statisticSelector = [
  ".ref-ratings article > strong",
  ".ref-call-card strong",
  ".ref-floating-stat strong",
  ".ref-proof__number strong",
  ".ref-callout-stat strong",
  ".service-ref__collage span strong",
  ".elevate-stats__grid strong",
  ".elevate-outcomes strong",
  ".elevate-quote__stats strong",
].join(",");

export function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || document.querySelector(".cms-admin, .admin-login")) {
      return;
    }

    const context = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(cardSelector);
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .map((entry) => entry.target as HTMLElement);
          if (!visible.length) return;

          gsap.to(visible, {
            autoAlpha: 1,
            y: 0,
            duration: 0.72,
            stagger: 0.08,
            ease: "power3.out",
            clearProps: "transform",
          });
          visible.forEach((element) => observer.unobserve(element));
        },
        { threshold: 0.14 },
      );

      if (cards.length) {
        gsap.set(cards, { autoAlpha: 0, y: 28 });
        cards.forEach((card) => revealObserver.observe(card));
      }

      const statistics = gsap.utils.toArray<HTMLElement>(statisticSelector);
      const countObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const element = entry.target as HTMLElement;
            const original = element.textContent?.trim() ?? "";
            const match = original.match(/-?\d+(?:\.\d+)?/);
            if (!match) return;
            const target = Number(match[0]);
            const decimals = match[0].includes(".")
              ? match[0].split(".")[1].length
              : 0;
            const state = { value: 0 };
            gsap.to(state, {
              value: target,
              duration: 1.35,
              ease: "power2.out",
              onUpdate: () => {
                element.textContent = original.replace(
                  match[0],
                  state.value.toFixed(decimals),
                );
              },
              onComplete: () => {
                element.textContent = original;
              },
            });
            observer.unobserve(element);
          });
        },
        { threshold: 0.45 },
      );
      statistics.forEach((statistic) => countObserver.observe(statistic));

      const interactive = gsap.utils.toArray<HTMLElement>(
        ".ref-button, .button, .contact-ref__submit, .ref-service-grid > a, .portfolio-ref__project, .elevate-button-secondary, .elevate-events a, .elevate-enquiry__types button",
      );
      const cleanups = interactive.map((element) => {
        const icon = element.querySelector("svg");
        const enter = () => {
          gsap.to(element, { y: -4, duration: 0.25, ease: "power2.out" });
          if (icon) gsap.to(icon, { x: 4, rotate: 4, duration: 0.3, ease: "back.out(2)" });
        };
        const leave = () => {
          gsap.to(element, { y: 0, duration: 0.28, ease: "power2.out" });
          if (icon) gsap.to(icon, { x: 0, rotate: 0, duration: 0.25 });
        };
        element.addEventListener("pointerenter", enter);
        element.addEventListener("pointerleave", leave);
        return () => {
          element.removeEventListener("pointerenter", enter);
          element.removeEventListener("pointerleave", leave);
        };
      });

      return () => {
        revealObserver.disconnect();
        countObserver.disconnect();
        cleanups.forEach((cleanup) => cleanup());
      };
    });

    return () => context.revert();
  }, [pathname]);

  return null;
}
