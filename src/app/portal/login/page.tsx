import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PortalSignInForm } from "@/components/portal-auth-forms";

export default function PortalLoginPage() { return <main className="portal-auth portal-auth--login"><section><Link href="/" className="portal-auth__brand"><BrandLogo className="brand-logo__image" priority /></Link><h1>Student Login Portal</h1><p>Sign in to view approved courses, secure materials, organisation registrations, invoices, and certificates.</p><PortalSignInForm /><div className="portal-auth__links"><Link href="/portal/register">Create a student account</Link><Link href="/portal/forgot-password">Forgot your password?</Link></div></section></main>; }
