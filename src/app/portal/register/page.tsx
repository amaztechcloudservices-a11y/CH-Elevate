import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PortalRegistrationForm } from "@/components/portal-auth-forms";

export const metadata: Metadata = { title: "Create a Student Account", robots: { index: false, follow: false } };
export default function PortalRegisterPage() { return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand"><BrandLogo className="brand-logo__image" priority /></Link><h1>Create your student account</h1><p>Register now to manage your course applications. Materials become available only after CH Elevate approves your enrolment.</p><PortalRegistrationForm /><div className="portal-auth__links"><Link href="/portal/login">Already registered? Sign in</Link></div></section></main>; }
