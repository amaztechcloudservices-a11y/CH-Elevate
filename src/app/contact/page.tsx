import type { Metadata } from "next";
import { Globe2, MapPin, Video } from "lucide-react";
import { Suspense } from "react";

import { ContactEnquiryForm } from "@/components/contact-enquiry-form";
import {
  ContactReferenceDetails,
  ContactReferenceMap,
} from "@/components/contact-reference-details";
import {
  ElevatePageShell,
  SectionHeading,
} from "@/components/elevate-sections";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact CH Elevate and send a confidential enquiry to our consultancy team.",
};

export default function ContactPage() {
  return (
    <ElevatePageShell pageSlug="contact" className="elevate-contact" newsletter={false}>
      <section className="elevate-section elevate-contact__lead">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Reach out"
            title="Expect a response within one business day."
            intro={<p>Tell us what your organisation is working through. Every enquiry is treated with full confidentiality and routed to the specialist best equipped to help.</p>}
          />
          <div className="contact-ref__grid">
            <ContactReferenceDetails />
            <div className="contact-ref__message">
              <h2>Send us a message</h2>
              <p>Select an enquiry type and share the context. We will respond with a thoughtful, practical next step.</p>
              <Suspense fallback={<p>Loading secure enquiry form…</p>}><ContactEnquiryForm /></Suspense>
            </div>
          </div>
        </div>
      </section>

      <section className="elevate-section elevate-contact__locations">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Where to find us"
            title="International support, available wherever you need us"
            intro={<p>CH Elevate serves clients through remote delivery and in-country engagements. Our team works across time zones so geography is never a barrier to world-class consultancy and coaching support.</p>}
            align="center"
          />
          <div className="elevate-location-grid">
            <article><MapPin aria-hidden="true" /><h3>Headquarters</h3><p>Kingston, Jamaica</p><span>Caribbean and international delivery</span></article>
            <article><Globe2 aria-hidden="true" /><h3>International engagements</h3><p>Onsite and hybrid delivery</p><span>Location and travel scope agreed per engagement</span></article>
            <article><Video aria-hidden="true" /><h3>Virtual engagements</h3><p>All time zones</p><span>Zoom · Microsoft Teams · Google Meet</span></article>
          </div>
        </div>
      </section>

      <ContactReferenceMap />

      <section className="elevate-section elevate-section--navy elevate-contact__final">
        <div className="ref-container">
          <SectionHeading eyebrow="Stay connected" title="A thoughtful, expert response within one business day." align="center" />
          <div className="elevate-contact-final">
            <article><h3>Follow CH Elevate</h3><p>LinkedIn: CH Elevate Consultancy<br />Facebook: @CHElevate<br />Instagram: @chelevate<br />YouTube: CH Elevate Consultancy</p></article>
            <article><h3>Our promise to you</h3><p>Every enquiry receives the seriousness, discretion, and professionalism your organisation deserves, whether you are exploring for the first time or ready to begin.</p></article>
            <article className="elevate-contact-final__priority"><h3>Priority contact</h3><p>For urgent enquiries related to an active engagement or time-sensitive transformation need:</p><a href="mailto:info@ch-elevateconsultancy.com">info@ch-elevateconsultancy.com</a><a href="tel:+18768290413">+1876-829-0413</a></article>
          </div>
        </div>
      </section>
    </ElevatePageShell>
  );
}
