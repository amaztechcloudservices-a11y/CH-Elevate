import Link from "next/link";
import { PortalActivationForm } from "@/components/portal-auth-forms";

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token = "" } = await searchParams; return <main className="portal-auth"><section><Link href="/" className="portal-auth__brand">CH Elevate</Link><h1>Activate your course portal</h1><p>Use the exact email address that received your approval invitation.</p>{token ? <PortalActivationForm token={token} /> : <p className="portal-auth__error">This activation link is incomplete.</p>}</section></main>; }
