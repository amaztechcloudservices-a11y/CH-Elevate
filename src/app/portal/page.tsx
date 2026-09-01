import type { Metadata } from "next";
import { ClientCoursePortal } from "@/components/client-course-portal";

export const metadata: Metadata = { title: "Client Course Portal", robots: { index: false, follow: false } };
export default function PortalPage() { return <ClientCoursePortal />; }
