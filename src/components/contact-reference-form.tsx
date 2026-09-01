"use client";

import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

type FormStatus =
  | { kind: "idle"; message: "" }
  | { kind: "submitting"; message: "Sending your message…" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const initialStatus: FormStatus = { kind: "idle", message: "" };

export function ContactReferenceForm({ defaultSubject = "" }: { defaultSubject?: string }) {
  const [status, setStatus] = useState<FormStatus>(initialStatus);

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
          consent: true,
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
        message: "Thank you. Your message has been received and our team will respond shortly.",
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
    <form className="contact-ref__form" onSubmit={handleSubmit}>
      <div className="contact-ref__field">
        <label htmlFor="contact-name">Full name</label>
        <input
          id="contact-name"
          name="name"
          placeholder="Full name"
          autoComplete="name"
          minLength={2}
          required
        />
      </div>
      <div className="contact-ref__field">
        <label htmlFor="contact-company">Organisation</label>
        <input
          id="contact-company"
          name="company"
          placeholder="Organisation"
          autoComplete="organization"
        />
      </div>
      <div className="contact-ref__field">
        <label htmlFor="contact-phone">Phone</label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          placeholder="Phone"
          autoComplete="tel"
        />
      </div>
      <div className="contact-ref__field">
        <label htmlFor="contact-email">Email address</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
      </div>
      <div className="contact-ref__field contact-ref__field--wide">
        <label htmlFor="contact-subject">Subject</label>
        <input
          id="contact-subject"
          name="subject"
          placeholder="Subject"
          defaultValue={defaultSubject}
          minLength={2}
          required
        />
      </div>
      <div className="contact-ref__field contact-ref__field--wide">
        <label htmlFor="contact-message">How can we help?</label>
        <textarea
          id="contact-message"
          name="message"
          placeholder="Tell us about your organisation, challenge, or enquiry."
          rows={5}
          minLength={10}
          required
        />
      </div>
      <button
        className="contact-ref__submit"
        type="submit"
        disabled={status.kind === "submitting"}
      >
        {status.kind === "submitting" ? "Sending…" : "Send message"}
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
