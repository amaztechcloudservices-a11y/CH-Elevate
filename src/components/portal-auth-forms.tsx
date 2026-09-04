"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { FormEvent, useRef, useState, useSyncExternalStore } from "react";

import { authClient } from "@/lib/auth-client";

const subscribeToHydration = () => () => undefined;

export function PortalSignInForm() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setMessage("Signing in…"); const result = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")), rememberMe: true }); if (result.error) { setMessage(result.error.message || "Sign in failed."); return; } window.location.assign("/portal/profile"); }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>Email address</span><input name="email" type="email" autoComplete="username" required /></label><label><span>Password</span><input name="password" type="password" autoComplete="current-password" minLength={8} required /></label><button type="submit"><LockKeyhole aria-hidden="true" /> Sign in</button><p role="status">{message}</p></form>;
}

export function PortalResetRequestForm() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const email = String(new FormData(event.currentTarget).get("email")); await authClient.requestPasswordReset({ email, redirectTo: "/portal/reset-password" }); setMessage("If that account exists, a reset link has been sent."); }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>Email address</span><input name="email" type="email" required /></label><button type="submit">Send reset link</button><p role="status">{message}</p></form>;
}

export function PortalResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const password = String(new FormData(event.currentTarget).get("password")); const result = await authClient.resetPassword({ token, newPassword: password }); if (result.error) { setMessage(result.error.message || "Password could not be reset."); return; } window.location.assign("/portal/login"); }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>New password</span><input name="password" type="password" minLength={8} required /></label><button type="submit">Reset password</button><p role="status">{message}</p></form>;
}

export function PortalActivationForm({ token }: { token: string }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const form = new FormData(event.currentTarget); inFlight.current = true; setBusy(true); setMessage("Creating your secure account…");
    const email = String(form.get("email")).trim(); const password = String(form.get("password"));
    try {
      const result = await authClient.signUp.email({ name: String(form.get("name")).trim(), email, password });
      if (result.error) {
        const signIn = await authClient.signIn.email({ email, password });
        if (signIn.error) { setMessage("Account activation failed. If you already have an account, enter its password or use password recovery."); return; }
      }
      const accepted = await fetch("/api/portal/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await accepted.json().catch(() => null) as { error?: string } | null;
      if (!accepted.ok) { setMessage(typeof body?.error === "string" ? body.error : "Invitation could not be accepted. Please try again."); return; }
      window.location.assign("/portal/profile");
    } catch { setMessage("Activation could not be completed. Please try again; your details have been kept."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>Full name</span><input name="name" disabled={!hydrated} required /></label><label><span>Invited email address</span><input name="email" type="email" disabled={!hydrated} required /></label><label><span>Create or enter password</span><input name="password" type="password" minLength={8} disabled={!hydrated} required /></label><button type="submit" disabled={!hydrated || busy}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />} Activate portal</button><p role="status">{message}</p></form>;
}

export function PortalRegistrationForm() {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const password = String(form.get("password")); if (password !== String(form.get("confirmPassword"))) { setMessage("The passwords do not match."); return; } setBusy(true); setMessage("Creating your account…"); const result = await authClient.signUp.email({ name: String(form.get("name")), email: String(form.get("email")), password }); if (result.error) { setBusy(false); setMessage(result.error.message || "Account registration failed."); return; } window.location.assign("/portal/profile"); }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>Full name</span><input name="name" autoComplete="name" required /></label><label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label><label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label><label><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label><button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />} Create student account</button><p role="status">{message}</p></form>;
}
