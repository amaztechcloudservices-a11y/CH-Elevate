import type { Metadata } from "next";
import { AdminCmsApp } from "@/components/admin-cms-app";

export const metadata: Metadata = { title: "Course Registration Administration", robots: { index: false, follow: false } };

export default function CourseAdminPage() {
  return <AdminCmsApp workspace="courses" initialTab="courses" />;
}
