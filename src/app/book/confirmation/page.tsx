import { CircleCheckBig, Clock3, Mail } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ReferenceFooter, ReferenceHeader } from "@/components/reference-site";
import confirmationPortrait from "../../../../public/images/jamaican-consultation-confirmation.png";

export const metadata: Metadata = {
  title: "Consultation Request Received",
  description: "Your CH Elevate consultation request has been recorded.",
};

export default function BookingConfirmationPage() {
  return (
    <div className="busima-home elevate-site elevate-confirmation-page">
      <ReferenceHeader />
      <main className="elevate-confirmation">
        <div className="ref-container elevate-confirmation__grid">
          <div className="elevate-confirmation__content">
            <span className="elevate-confirmation__status">
              <CircleCheckBig aria-hidden="true" /> Request received
            </span>
            <p className="ref-kicker">Thank you for choosing CH Elevate</p>
            <h1>Your consultation request is received.</h1>
            <p className="elevate-confirmation__lead">
              We have saved your preferred date and time. A member of our team will
              review the details and send the final appointment confirmation by email.
            </p>
            <div className="elevate-confirmation__next">
              <div>
                <Mail aria-hidden="true" />
                <p><strong>Watch your inbox</strong><span>Your confirmation and meeting details will arrive by email.</span></p>
              </div>
              <div>
                <Clock3 aria-hidden="true" />
                <p><strong>What happens next</strong><span>We will review your request and follow up as soon as possible.</span></p>
              </div>
            </div>
            <div className="elevate-confirmation__actions">
              <Link className="ref-button" href="/">Return home</Link>
              <Link className="elevate-button-secondary" href="/contact">Contact us</Link>
            </div>
          </div>
          <figure className="elevate-confirmation__portrait">
            <Image
              src={confirmationPortrait}
              alt="A smiling Jamaican businesswoman welcoming a consultation request"
              priority
              sizes="(max-width: 900px) 100vw, 45vw"
            />
            <figcaption>Your next conversation starts here.</figcaption>
          </figure>
        </div>
      </main>
      <ReferenceFooter />
    </div>
  );
}
