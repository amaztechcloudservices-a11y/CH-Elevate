import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
export const metadata: Metadata = { title: "Terms" };
export default function TermsPage() { return <PublicShell><main className="legal-page site-container"><h1>Website terms</h1><p>These preview terms must be replaced with counsel-approved terms before launch.</p><h2>Website information</h2><p>Published material is general information and does not create a consulting engagement.</p><h2>Appointments</h2><p>A requested consultation is not confirmed until an authorised representative sends confirmation.</p><h2>Intellectual property</h2><p>Final ownership and permitted-use wording will reflect the approved client materials and agreements.</p></main></PublicShell>; }
