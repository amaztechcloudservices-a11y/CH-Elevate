"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState, useSyncExternalStore } from "react";

import { authClient } from "@/lib/auth-client";

const subscribeToHydration = () => () => undefined;

function PasswordField({ label, name, autoComplete }: { label: string; name: string; autoComplete: "current-password" | "new-password" }) {
  const [shown, setShown] = useState(false);
  return <label><span>{label}</span><span className="portal-password"><input name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} minLength={8} required aria-describedby={`${name}-requirements`} /><button type="button" aria-label={`${shown ? "Hide" : "Show"} ${label.toLowerCase()}`} onClick={() => setShown((value) => !value)}>{shown ? <EyeOff /> : <Eye />}</button></span><small id={`${name}-requirements`}>Use at least 8 characters.</small></label>;
}

export function PortalSignInForm() {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy) return; const form = new FormData(event.currentTarget); setBusy(true); setMessage("Signing in…"); try { const result = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")), rememberMe: true }); if (result.error) { setMessage(result.error.message || "Sign in failed."); return; } router.push("/portal/profile"); } catch { setMessage("Sign in could not be completed. Check your connection and try again."); } finally { setBusy(false); } }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>Email address</span><input name="email" type="email" autoComplete="username" required /></label><PasswordField label="Password" name="password" autoComplete="current-password" /><button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <LockKeyhole aria-hidden="true" />} Sign in</button><p role="status">{message}</p></form>;
}

export function PortalResetRequestForm() {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy) return; const email = String(new FormData(event.currentTarget).get("email")); setBusy(true); try { await authClient.requestPasswordReset({ email, redirectTo: "/portal/reset-password" }); setMessage("If that account exists, a reset link has been sent."); } catch { setMessage("The reset request could not be completed. Please try again."); } finally { setBusy(false); } }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label><button type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" />} Send reset link</button><p role="status">{message}</p></form>;
}

export function PortalResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy) return; const password = String(new FormData(event.currentTarget).get("password")); setBusy(true); try { const result = await authClient.resetPassword({ token, newPassword: password }); if (result.error) { setMessage(result.error.message || "Password could not be reset."); return; } router.push("/portal/login"); } catch { setMessage("Password reset could not be completed. Please try again."); } finally { setBusy(false); } }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><PasswordField label="New password" name="password" autoComplete="new-password" /><button type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" />} Reset password</button><p role="status">{message}</p></form>;
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
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy) return; const form = new FormData(event.currentTarget); const password = String(form.get("password")); if (password !== String(form.get("confirmPassword"))) { setMessage("The passwords do not match."); return; } setBusy(true); setMessage("Creating your account…"); try { const result = await authClient.signUp.email({ name: String(form.get("name")), email: String(form.get("email")), password }); if (result.error) { setMessage(result.error.message || "Account registration failed."); return; } router.push("/portal/profile"); } catch { setMessage("Account registration could not be completed. Your details have been kept."); } finally { setBusy(false); } }
  return <form className="portal-auth__form" method="post" onSubmit={submit}><p>Create a secure student account to access approved course materials. Applying for a course is a separate step.</p><label><span>Full name</span><input name="name" autoComplete="name" required /></label><label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label><PasswordField label="Password" name="password" autoComplete="new-password" /><PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" /><button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />} Create student account</button><p role="status">{message}</p></form>;
}
