import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { legacyAdminDestination } from "@/lib/admin-workspaces";

export const metadata: Metadata = {
  title: "Website Administration",
  robots: { index: false, follow: false },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // Preserve bookmarks while routing to separate workspaces.
  // https://nextjs.org/docs/app/api-reference/functions/redirect
  redirect(legacyAdminDestination(tab));
}
