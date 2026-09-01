---
version: alpha
name: Clarhen Consulting Preview
description: A sharp, photography-led consultancy system derived from the approved Busima reference kit and Clarhen concept set.
colors:
  primary: "#0B43D6"
  primary-deep: "#051C48"
  primary-dark: "#031431"
  accent: "#FFCF20"
  canvas: "#FFFFFF"
  surface: "#F5F7FA"
  surface-blue: "#EDF3FF"
  ink: "#07142E"
  text: "#465269"
  text-on-dark: "#FFFFFF"
  border: "#D9E0EA"
  focus: "#FFCF20"
  success: "#16794A"
  warning: "#A96700"
  danger: "#B42318"
typography:
  display:
    fontFamily: Manrope
    fontSize: 59px
    fontWeight: 650
    lineHeight: 1
    letterSpacing: -0.034em
  headline:
    fontFamily: Manrope
    fontSize: 44px
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: -0.045em
  title:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: -0.02em
  body-large:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.2
rounded:
  none: 0px
  xs: 4px
  sm: 8px
  md: 12px
  full: 9999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  20: 80px
  24: 96px
  32: 128px
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "{spacing.4}"
  button-secondary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "{spacing.4}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "{spacing.4}"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "{spacing.8}"
---

## Overview

Clarhen is presented as a decisive, modern consultancy. The system retains the
Busima kit's blue, yellow, and photography-led language. The public homepage
uses the accepted Busima screenshot as its layout reference while all brand
identity, business copy, and contact details remain Clarhen-owned.

The current identity, copy, locations, people, metrics, prices, and case studies
are temporary preview content until the client materials are approved.

## Colors

True white is the main canvas. Deep navy establishes trust and provides the
footer and administration shell. Cobalt creates high-energy editorial bands.
Yellow is reserved for primary actions, focus, and small moments of emphasis.

## Typography

Bundle Manrope Variable for display and Inter Variable for body and interface
text. JetBrains Mono is available only for technical identifiers. Headings use
tight but never narrower than -0.045em tracking. Interface controls are always
purposefully sized.

## Layout

Use a 1280px standard container with fluid 20-64px gutters. Public pages use
the reference homepage sequence: 793px hero, overlapping service and contact
rail, two-column company introduction, full-width impact band, six-card service
grid, joined media/strategy pair, three proof cards, overlapping capability
card and video band, consultation panel, newsletter strip, and compact footer.
The About page uses the companion reference sequence: 410px internal hero,
repeated company and impact blocks, split value statement with a three-item
principles stack, three capability cards and partner row, capability/video
band, centred recruitment call-to-action, newsletter, and shared footer.
The Services page uses the companion services sequence: 410px internal hero,
expertise narrative with a two-image statistics collage, joined strategy
media, six-service grid, impact and proof strip, three proof cards, testimonial
image band, newsletter, and shared footer.
The Contact page uses the companion contact sequence: 410px internal hero,
paired square-edged contact and message panels, a full-width functional
grayscale map, newsletter strip, and shared footer. Form controls use the same
near-square geometry and deliberate interface typography as the rest of the
system.
The FAQ page uses the companion FAQ sequence: 410px internal hero, searchable
two-column disclosure list, four-article editorial row, full-width impact
image band, newsletter strip, and shared footer. FAQ sits immediately after
Services in the public navigation.
The Portfolio page uses the companion portfolio sequence: 410px analytics
hero, split expertise narrative with an overlapping success statistic, a
six-project editorial grid, testimonial image band, newsletter strip, and
shared footer. Portfolio sits immediately after Services in the public
navigation, with FAQ following it.
The administration area uses a fixed navy rail on desktop and a collapsible
navigation pattern on smaller screens.

## Elevation

Prefer fine borders, tonal separation, overlap, and image planes. Shadows are
limited to the hero service rail and temporary elevated navigation.

## Shapes

Near-square geometry is the default. Controls use 4-8px radii, panels use no
more than 12px, and pills are restricted to compact status labels.

## Components

Primary buttons are yellow with dark text and a directional arrow. Secondary
buttons are cobalt or outlined. Service links are open rows separated by fine
rules. Case studies use image planes joined directly to coloured information
planes. Form labels remain visible above controls.

## Do's and Don'ts

- Do keep photography natural, locally stored, and consistently cropped.
- Do vary section rhythm while maintaining shared gutters and type hierarchy.
- Do preserve visible focus, reduced motion, and responsive reflow.
- Do treat all current business claims as temporary preview content.
- Don't use glassmorphism, beige canvas colours, gradient text, or giant radii.
- Don't turn every content group into a card.
- Don't publish the temporary identity or referenced assets without approval.
