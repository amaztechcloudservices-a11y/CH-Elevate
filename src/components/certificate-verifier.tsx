"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Certificate = { certificateNumber: string; participantName: string; courseTitle: string; completedAt: string; issuedAt: string; valid: boolean };

export function CertificateVerifier() {
  const [certificate, setCertificate] = useState<Certificate | null>(null); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const number = String(new FormData(event.currentTarget).get("number")); const response = await fetch(`/api/certificates/verify?number=${encodeURIComponent(number)}`); const result = await response.json() as { data?: Certificate }; if (!response.ok || !result.data) { setCertificate(null); setMessage("No certificate matched that exact number."); return; } setCertificate(result.data); setMessage(""); }
  return <main className="portal-auth"><section><Link className="portal-auth__brand" href="/">CH Elevate</Link><h1>Verify a certificate</h1><p>Enter the complete certificate number shown on the CH Elevate certificate.</p><form className="portal-auth__form" onSubmit={submit}><label><span>Certificate number</span><input name="number" placeholder="CHE-2026-AB12CD34" required /></label><button type="submit">Verify certificate</button></form>{message && <p className="portal-auth__error" role="status">{message}</p>}{certificate && <div className="certificate-result"><strong>{certificate.valid ? "Valid certificate" : "Revoked certificate"}</strong><h2>{certificate.participantName}</h2><p>{certificate.courseTitle}</p><p>Completed {new Date(certificate.completedAt).toLocaleDateString("en-JM", { dateStyle: "long" })}</p><code>{certificate.certificateNumber}</code></div>}</section></main>;
}
