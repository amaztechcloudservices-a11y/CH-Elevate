import type { Metadata } from "next";
import { StudentProfilePage } from "@/components/student-profile-page";

export const metadata: Metadata = { title: "Student Profile", robots: { index: false, follow: false } };
export default function ProfilePage() { return <StudentProfilePage />; }
