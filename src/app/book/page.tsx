import type { Metadata } from "next";

import { ConsultationForm } from "@/components/consultation-form";
import { ReferenceFooter, ReferenceHeader } from "@/components/reference-site";

export const metadata: Metadata = {
  title: "Book a Discovery Call",
  description: "Request a complimentary 30-minute discovery call with a senior CH Elevate consultant.",
};

export default function BookPage() {
  return (
    <div className="busima-home elevate-site elevate-book-page">
      <section className="elevate-book-hero">
        <ReferenceHeader />
        <div className="ref-container">
          <p className="ref-kicker ref-kicker--light">Complimentary discovery call</p>
          <h1>A focused 30-minute conversation.</h1>
          <p>Share your organisation&apos;s context, explore the right service or programme, and receive an honest expert perspective with no obligation, sales pitch, or pressure.</p>
        </div>
      </section>
      <main>
        <section className="elevate-section">
          <div className="ref-container elevate-book-page__grid">
            <div>
              <p className="ref-kicker">What to expect</p>
              <h2>Start with the right conversation.</h2>
              <ol>
                <li><span>01</span><p>Tell us about the decision, challenge, or opportunity.</p></li>
                <li><span>02</span><p>Choose an available date and time for a 30-minute video consultation.</p></li>
                <li><span>03</span><p>An administrator reviews your request and confirms the booking by email.</p></li>
              </ol>
            </div>
            <ConsultationForm />
          </div>
        </section>
      </main>
      <ReferenceFooter />
    </div>
  );
}
