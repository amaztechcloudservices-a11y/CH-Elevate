"use client";

import { ArrowRight, CalendarClock, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useSiteContent } from "@/lib/use-site-content";

type Slot = { value: string; label: string; startsAt: string };

async function readApiResult(response: Response) {
  const body = await response.text();
  if (!body) return {};

  try {
    return JSON.parse(body) as {
      ok?: boolean;
      slots?: Slot[];
      error?: string;
    };
  } catch {
    return {};
  }
}

export function ConsultationForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { forms } = useSiteContent();
  const definition = forms.find((form) => form.key === "booking");
  const serviceField = definition?.fields.find((field) => field.name === "service");
  const timelineField = definition?.fields.find((field) => field.name === "timeline");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [status, setStatus] = useState<{
    kind: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });
  const minimumDate = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    return value.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    if (!date) return;

    let active = true;
    fetch(`/api/bookings/availability?date=${encodeURIComponent(date)}`)
      .then(async (response) => {
        const result = await readApiResult(response);
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Available times could not be loaded.");
        }
        if (active) setSlots(result.slots ?? []);
      })
      .catch((error) => {
        if (active) {
          setSlots([]);
          const message =
            error instanceof Error
              ? error.message
              : "Available times could not be loaded.";
          setSlotError(message);
          setStatus({
            kind: "error",
            message,
          });
        }
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [date]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus({ kind: "submitting", message: "Submitting your request…" });

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          company: formData.get("company"),
          service: formData.get("service"),
          date: formData.get("date"),
          time: formData.get("time"),
          priority: formData.get("priority"),
          timeline: formData.get("timeline"),
          consent: formData.get("consent") === "on",
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Your booking could not be submitted.");
      }

      form.reset();
      setDate("");
      setSlots([]);
      setStatus({
        kind: "success",
        message:
          definition?.successMessage ??
          "Your appointment request has been received and is pending confirmation.",
      });
      router.replace("/book/confirmation");
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Your booking could not be submitted.",
      });
    }
  }

  return (
    <form
      className={`consultation-form ${compact ? "consultation-form--compact" : ""}`}
      onSubmit={handleSubmit}
    >
      <div className="field">
        <label htmlFor={`name-${compact}`}>Full name</label>
        <input id={`name-${compact}`} name="name" autoComplete="name" minLength={2} required />
      </div>
      <div className="field">
        <label htmlFor={`email-${compact}`}>Email</label>
        <input id={`email-${compact}`} name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor={`phone-${compact}`}>Phone</label>
        <input id={`phone-${compact}`} name="phone" type="tel" autoComplete="tel" minLength={7} required />
      </div>
      <div className="field">
        <label htmlFor={`company-${compact}`}>Company</label>
        <input id={`company-${compact}`} name="company" autoComplete="organization" />
      </div>
      <div className="field">
        <label htmlFor={`service-${compact}`}>Service</label>
        <select id={`service-${compact}`} name="service" required defaultValue="">
          <option value="" disabled>Select a service</option>
          {(serviceField?.options ?? []).map((service) => (
            <option key={service} value={service}>{service}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`date-${compact}`}>Preferred date</label>
        <input
          id={`date-${compact}`}
          name="date"
          type="date"
          min={minimumDate}
          value={date}
          onChange={(event) => {
            setSlots([]);
            setSlotError("");
            setLoadingSlots(Boolean(event.target.value));
            setDate(event.target.value);
          }}
          required
        />
      </div>
      <div className="field field--wide">
        <label htmlFor={`time-${compact}`}>Available time</label>
        <div className="booking-time-control">
          <CalendarClock aria-hidden="true" />
          <select
            id={`time-${compact}`}
            name="time"
            required
            defaultValue=""
            disabled={!date || loadingSlots || slots.length === 0}
            key={`${date}-${slots.length}`}
          >
            <option value="" disabled>
              {loadingSlots
                ? "Loading available times…"
                : slotError
                  ? "Times unavailable. Try again."
                : slots.length
                  ? "Choose a time"
                  : date
                    ? "No times available. Choose another date."
                    : "Choose a date first"}
            </option>
            {slots.map((slot) => (
              <option key={slot.startsAt} value={slot.value}>{slot.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field field--wide">
        <label htmlFor={`priority-${compact}`}>
          What would make this consultation valuable?
        </label>
        <textarea
          id={`priority-${compact}`}
          name="priority"
          rows={compact ? 3 : 5}
          placeholder="Describe the decision, challenge, or opportunity."
          minLength={10}
          required
        />
      </div>
      <div className="field field--wide">
        <label htmlFor={`timeline-${compact}`}>Desired timeline</label>
        <select id={`timeline-${compact}`} name="timeline" required defaultValue="">
          <option value="" disabled>Select a timeline</option>
          {(timelineField?.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <label className="form-consent field--wide">
        <input name="consent" type="checkbox" required />
        <span>I consent to CH Elevate using this information to manage my appointment.</span>
      </label>
      <button
        className="button button--accent"
        type="submit"
        disabled={status.kind === "submitting"}
      >
        {status.kind === "submitting" ? (
          <><LoaderCircle className="spin" aria-hidden="true" /> Submitting…</>
        ) : (
          <>{definition?.submitLabel ?? "Request consultation"} <ArrowRight aria-hidden="true" /></>
        )}
      </button>
      <p
        className={`form-note form-note--${status.kind}`}
        role="status"
        aria-live="polite"
      >
        {status.message || "Your information will be used only to respond to this request."}
      </p>
    </form>
  );
}
