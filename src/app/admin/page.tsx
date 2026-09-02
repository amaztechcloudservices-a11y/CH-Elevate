import type { Metadata } from "next";

import { AdminCmsApp, type AdminTab } from "@/components/admin-cms-app";

export const metadata: Metadata = {
  title: "Website Administration",
  robots: { index: false, follow: false },
};

const adminTabs: AdminTab[] = [
  "overview",
  "global",
  "navigation",
  "hero",
  "pages",
  "forms",
  "bookings",
  "inbox",
  "availability",
  "courses",
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab = adminTabs.includes(tab as AdminTab) ? tab as AdminTab : "overview";
  return <AdminCmsApp initialTab={initialTab} />;
}
