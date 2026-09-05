"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { useSiteContent } from "@/lib/use-site-content";

type FormStatus =
  | { kind: "idle"; message: "" }
  | { kind: "submitting"; message: "Sending your message…" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const initialStatus: FormStatus = { kind: "idle", message: "" };

export function ContactReferenceForm({ defaultSubject = "", onSubjectChange }: { defaultSubject?: string; onSubjectChange?: (value: string) => void }) {
  const { forms, settings } = useSiteContent();
  const definition = forms.find((form) => form.key === "contact");
  const field = (name: string) => definition?.fields.find((candidate) => candidate.name === name);
  const [status, setStatus] = useState<FormStatus>(initialStatus);

  if (definition && !definition.isActive) {
    return <div className="contact-ref__unavailable" role="status"><p>The enquiry form is temporarily unavailable.</p><a href={`mailto:${settings.footerEmail}`}>Email {settings.footerEmail}</a></div>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setStatus({ kind: "submitting", message: "Sending your message…" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          phone: formData.get("phone") || undefined,
          company: formData.get("company") || undefined,
          subject: formData.get("subject"),
          message: formData.get("message"),
          consent: formData.get("consent") === "on",
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "We could not send your message.");
      }

      form.reset();
      setStatus({
        kind: "success",
        message: definition?.successMessage ?? "Thank you. Your message has been received and our team will respond shortly.",
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not send your message. Please try again.",
      });
    }
  }

  return (
    <form className="contact-ref__form" onSubmit={handleSubmit} aria-busy={status.kind === "submitting"}>
      <div className="contact-ref__field">
        <label htmlFor="contact-name">{field("name")?.label ?? "Full name"}</label>
        <input
          id="contact-name"
          name="name"
          placeholder={field("name")?.placeholder || "Full name"}
          autoComplete="name"
          minLength={2}
          required
        />
      </div>
      <div className="contact-ref__field">
        <label htmlFor="contact-company">{field("company")?.label ?? "Organisation"}</label>
        <input
          id="contact-company"
          name="company"
          placeholder={field("company")?.placeholder || "Organisation"}
          autoComplete="organization"
        />
      </div>
      <div className="contact-ref__field">
        <label htmlFor="contact-phone">{field("phone")?.label ?? "Phone"}</label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          placeholder={field("phone")?.placeholder || "Phone"}
          autoComplete="tel"
        />
      </div>
      <div className="contact-ref__field">
        <label htmlFor="contact-email">{field("email")?.label ?? "Email address"}</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          placeholder={field("email")?.placeholder || "Email"}
          autoComplete="email"
          required
        />
      </div>
      <div className="contact-ref__field contact-ref__field--wide">
        <label htmlFor="contact-subject">{field("subject")?.label ?? "Subject"}</label>
        <input
          id="contact-subject"
          name="subject"
          placeholder={field("subject")?.placeholder || "Subject"}
          value={defaultSubject}
          onChange={(event) => onSubjectChange?.(event.target.value)}
          minLength={2}
          required
        />
      </div>
      <div className="contact-ref__field contact-ref__field--wide">
        <label htmlFor="contact-message">{field("message")?.label ?? "How can we help?"}</label>
        <textarea
          id="contact-message"
          name="message"
          placeholder={field("message")?.placeholder || "Tell us about your organisation, challenge, or enquiry."}
          rows={5}
          minLength={10}
          required
        />
      </div>
      <label className="contact-ref__consent contact-ref__field--wide">
        <input name="consent" type="checkbox" required />
        <span>I agree that CH Elevate may use these details to respond to my enquiry. See our <Link href="/privacy">Privacy Policy</Link>.</span>
      </label>
      <button
        className="contact-ref__submit"
        type="submit"
        disabled={status.kind === "submitting"}
      >
        {status.kind === "submitting" ? "Sending…" : (definition?.submitLabel ?? "Send message")}
        <Send aria-hidden="true" />
      </button>
      <p
        className={`contact-ref__status contact-ref__status--${status.kind}`}
        role="status"
        aria-live="polite"
      >
        {status.message}
      </p>
    </form>
  );
}
