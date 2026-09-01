import Link from "next/link";
import { PortalResetPasswordForm } from "@/components/portal-auth-forms";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token = "" } = await searchParams; return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand">CH Elevate</Link><h1>Choose a new password</h1>{token ? <PortalResetPasswordForm token={token} /> : <p>This reset link is incomplete.</p>}</section></main>; }
