# Busima template-kit JSON audit

Source archive:
`busima-business-consultant-elementor-template-ki-2026-04-01-13-31-42-utc.zip`

Reviewed on 29 July 2026. The JSON was read directly from the supplied archive;
the website does not execute Elementor or WordPress code.

## Templates reviewed

| Template | Containers | Widgets | Behaviour carried into the custom build |
| --- | ---: | ---: | --- |
| `busima-home.json` | 46 | 79 | Hero, services, counters, progress, video, CTA, contact form, newsletter |
| `busima-home-2.json` | 52 | 72 | Alternative hero/content patterns, accordion, posts, video, carousel |
| `busima-about-us.json` | 31 | 53 | Internal hero, values, counters, progress, video, CTA |
| `busima-services.json` | 36 | 51 | Service cards, counters, images, testimonial carousel, video |
| `busima-portfolio.json` | 10 | 23 | Portfolio cards, counter, testimonial carousel, CTAs |
| `busima-faq.json` | 9 | 11 | Search, two-column accordions, article listing, CTA |
| `busima-contact-us.json` | 6 | 14 | Contact details, form, social links, functional map |
| `busima-team.json` | 22 | 33 | Team imagery, counters, progress, video |
| `busima-pricing-plan.json` | 22 | 39 | Packages, lists, counters, contact form |
| `busima-blog.json` | 4 | 3 | Archive heading and post listing |
| `busima-single-post.json` | 7 | 11 | Article metadata, author, share, comments, related posts |
| `busima-error-404.json` | 3 | 4 | Error message and recovery CTA |
| `busima-header.json` | 3 | 3 | Logo, navigation, CTA |
| `busima-footer.json` | 9 | 15 | Newsletter, service/company links, contact details, social links |
| `global.json` | n/a | n/a | Global colour and typography direction |

## Implementation decisions

- The visual templates remain the design reference, but Elementor-specific
  runtime behaviour is replaced with native Next.js components.
- Header, footer, navigation, phone, email, address, map, social links, hero
  slides, page sections, form definitions, and booking availability use a
  structured CMS contract.
- The CMS deliberately constrains section types to the approved design system;
  it is not an unrestricted drag-and-drop page builder.
- Contact, newsletter, and booking data is persisted in PostgreSQL and exposed
  to the authenticated client-administrator inbox.
- Video controls use the template kit's configured YouTube reference
  `XHOmBV4js_E` through the privacy-enhanced embed domain.
- Template counters, progress indicators, cards, icons, CTAs, and hero changes
  are implemented with accessible, reduced-motion-aware interaction.

## Widget inventory highlights

- Home: 28 headings, 15 icon boxes, 7 buttons, 4 progress bars, 2 counters,
  video, form, imagery, ratings, and text.
- Services: 14 icon boxes, 13 headings, 5 buttons, 5 images, 3 counters, video,
  and testimonial carousel.
- About: 19 headings, 6 buttons, 4 progress bars, 3 icon boxes, 2 counters,
  ratings, video, imagery, and carousel.
- FAQ: two accordions plus search, posts, CTA, headings, and body content.
- Contact: six headings, three icon boxes, form, map, divider, and social links.
- Footer: form, icon lists, contact box, social links, logo, headings, and copy.
