import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PortalResetPasswordForm } from "@/components/portal-auth-forms";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token = "" } = await searchParams; return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand"><BrandLogo className="brand-logo__image" priority /></Link><h1>Choose a new password</h1>{token ? <PortalResetPasswordForm token={token} /> : <p>This reset link is incomplete.</p>}</section></main>; }
