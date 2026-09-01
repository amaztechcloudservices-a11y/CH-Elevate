import type { Metadata } from "next";

import { AdminCmsApp } from "@/components/admin-cms-app";

export const metadata: Metadata = {
  title: "Website Administration",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminCmsApp />;
}
