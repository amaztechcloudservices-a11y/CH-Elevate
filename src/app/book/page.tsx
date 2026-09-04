import type { Metadata } from "next";

import { ConsultationForm } from "@/components/consultation-form";

export const metadata: Metadata = {
  title: "Book a Discovery Call",
  description: "Choose a CH Elevate booking event, select an available time and request a conversation with our team.",
};

export default function BookPage() {
  return (
    <div className="busima-home elevate-site elevate-book-page">
      <section className="elevate-book-hero">
        <div className="ref-container">
          <p className="ref-kicker ref-kicker--light">Book a conversation</p>
          <h1>Make time for your next step.</h1>
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
                <li><span>02</span><p>Choose a booking event, then an available date and time. The event shows its session duration.</p></li>
                <li><span>03</span><p>An administrator reviews your request and confirms the booking by email.</p></li>
              </ol>
            </div>
            <ConsultationForm />
          </div>
        </section>
      </main>
    </div>
  );
}
