"use client";

import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function AdminLoginForm() {
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

    window.location.assign("/admin");
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
        Sign in <ArrowRight aria-hidden="true" />
      </button>
      <p className={`admin-login__status admin-login__status--${status.kind}`} role="status">
        {status.message}
      </p>
    </form>
  );
}
