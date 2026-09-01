import type { Metadata } from "next";
import Link from "next/link";

import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata: Metadata = {
  title: "Administrator Sign In",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="admin-login">
      <section>
        <Link className="admin-login__brand" href="/">
          CH Elevate <span>consultancy limited</span>
        </Link>
        <p className="section-label">Secure administration</p>
        <h1>Manage the entire website.</h1>
        <p>
          Sign in with the client administrator account to update content,
          forms, appointments, contact details, navigation, and availability.
        </p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
