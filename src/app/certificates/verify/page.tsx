import type { Metadata } from "next";
import { CertificateVerifier } from "@/components/certificate-verifier";

export const metadata: Metadata = { title: "Verify a Course Certificate" };
export default function CertificateVerificationPage() { return <CertificateVerifier />; }
