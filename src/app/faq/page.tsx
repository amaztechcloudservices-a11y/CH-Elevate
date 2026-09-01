import type { Metadata } from "next";

import { CtaBand, ElevatePageShell, SectionHeading } from "@/components/elevate-sections";
import { FaqReferenceContent } from "@/components/faq-reference-content";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers about CH Elevate, our services, how engagements work, investment, guarantees, and international delivery.",
};

export default function FaqPage() {
  return (
    <ElevatePageShell pageSlug="faq" className="elevate-faq">
      <section className="elevate-section elevate-faq__intro">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Everything you need to know"
            title="Working with CH Elevate"
            intro={<p>We have compiled answers to the questions most frequently asked by prospective clients across our four sectors. If you do not find what you need, please reach out directly. We are always happy to talk.</p>}
            align="center"
          />
        </div>
      </section>
      <section className="faq-ref__faq"><FaqReferenceContent /></section>
      <CtaBand
        title="Still have questions?"
        body="A senior CH Elevate consultant will give you a clear, direct answer and help you identify the most useful next step."
        primary={{ label: "Book a discovery call", href: "/book" }}
        secondary={{ label: "Send us a message", href: "/contact" }}
      />
    </ElevatePageShell>
  );
}
