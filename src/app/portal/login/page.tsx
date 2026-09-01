import Link from "next/link";
import { PortalSignInForm } from "@/components/portal-auth-forms";

export default function PortalLoginPage() { return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand">CH Elevate</Link><h1>Client course portal</h1><p>Sign in to view approved courses, secure materials, organisation registrations, invoices, and certificates.</p><PortalSignInForm /><div className="portal-auth__links"><Link href="/portal/register">Create a student account</Link><Link href="/portal/forgot-password">Forgot your password?</Link></div></section></main>; }
