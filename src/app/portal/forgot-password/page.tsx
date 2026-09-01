import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PortalResetRequestForm } from "@/components/portal-auth-forms";

export default function ForgotPasswordPage() { return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand"><BrandLogo className="brand-logo__image" priority /></Link><h1>Reset your password</h1><p>Enter the email connected to your approved course portal account.</p><PortalResetRequestForm /></section></main>; }
