"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ContactReferenceForm } from "@/components/contact-reference-form";

const enquiryTypes = [
  "PMO Consultancy",
  "Process Improvement",
  "Coaching & Programmes",
  "Training & Certification",
  "Community Membership",
  "General Enquiry",
];

export function ContactEnquiryForm() {
  const searchParams = useSearchParams();
  const requestedSubject = searchParams.get("subject");
  const safeSubject = requestedSubject && requestedSubject.length <= 120 ? requestedSubject : "";
  const initialType = enquiryTypes.includes(safeSubject)
    ? safeSubject
    : /membership|community/i.test(safeSubject)
      ? "Community Membership"
      : /training|masterclass|certification/i.test(safeSubject)
        ? "Training & Certification"
        : /coaching|programme/i.test(safeSubject)
          ? "Coaching & Programmes"
          : /process/i.test(safeSubject)
            ? "Process Improvement"
            : /pmo/i.test(safeSubject)
              ? "PMO Consultancy"
              : "General Enquiry";
  const [selected, setSelected] = useState(initialType);
  const [subject, setSubject] = useState(safeSubject || initialType);

  return (
    <div className="elevate-enquiry">
      <div className="elevate-enquiry__types" aria-label="Select an enquiry type">
        {enquiryTypes.map((type) => (
          <button
            className={selected === type ? "is-active" : undefined}
            key={type}
            type="button"
            aria-pressed={selected === type}
            onClick={() => {
              setSelected(type);
              setSubject(type);
            }}
          >
            {type}
          </button>
        ))}
      </div>
      <ContactReferenceForm defaultSubject={subject} key={subject} />
    </div>
  );
}
