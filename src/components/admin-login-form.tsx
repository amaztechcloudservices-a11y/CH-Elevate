"use client";

import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

function getAdminDestination() {
  const requested = new URLSearchParams(window.location.search).get("next");
  if (!requested || requested.startsWith("//")) return "/admin";

  const destination = new URL(requested, window.location.origin);
  if (
    destination.origin !== window.location.origin
    || (destination.pathname !== "/admin" && !destination.pathname.startsWith("/admin/"))
  ) {
    return "/admin";
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function AdminLoginForm({ buttonLabel = "Sign in to website administration" }: { buttonLabel?: string }) {
  const [status, setStatus] = useState<{
    kind: "idle" | "submitting" | "error";
    message: string;
  }>({ kind: "idle", message: "" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ kind: "submitting", message: "Signing in…" });

    const result = await authClient.signIn.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      rememberMe: true,
    });

    if (result.error) {
      setStatus({
        kind: "error",
        message: result.error.message || "The email or password was not accepted.",
      });
      return;
    }

    window.location.assign(getAdminDestination());
  }

  return (
    <form className="admin-login__form" method="post" onSubmit={handleSubmit}>
      <label>
        <span>Email address</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" minLength={8} required />
      </label>
      <button className="button button--accent" type="submit" disabled={status.kind === "submitting"}>
        {status.kind === "submitting" ? <LoaderCircle className="spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
        {buttonLabel} <ArrowRight aria-hidden="true" />
      </button>
      <p className={`admin-login__status admin-login__status--${status.kind}`} role="status">
        {status.message}
      </p>
    </form>
  );
}
