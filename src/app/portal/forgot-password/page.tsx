import Link from "next/link";
import { PortalResetRequestForm } from "@/components/portal-auth-forms";

export default function ForgotPasswordPage() { return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand">CH Elevate</Link><h1>Reset your password</h1><p>Enter the email connected to your approved course portal account.</p><PortalResetRequestForm /></section></main>; }
