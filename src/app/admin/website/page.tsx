import type { Metadata } from "next";
import { AdminCmsApp, type AdminTab } from "@/components/admin-cms-app";
import { adminWorkspaces } from "@/lib/admin-workspaces";

export const metadata: Metadata = { title: "Website Management", robots: { index: false, follow: false } };

export default async function WebsiteAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab = adminWorkspaces.website.tabs.some((item) => item === tab) ? tab as AdminTab : "overview";
  return <AdminCmsApp key={initialTab} workspace="website" initialTab={initialTab} />;
}
