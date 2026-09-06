import type { Metadata } from "next";
import { AdminCmsApp } from "@/components/admin-cms-app";

export const metadata: Metadata = { title: "System Settings", robots: { index: false, follow: false } };

export default function SystemAdminPage() {
  return <AdminCmsApp workspace="system" initialTab="system" />;
}
