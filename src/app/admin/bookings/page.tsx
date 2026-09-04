import type { Metadata } from "next";
import { AdminCmsApp } from "@/components/admin-cms-app";

export const metadata: Metadata = { title: "Booking Administration", robots: { index: false, follow: false } };

export default async function BookingAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab = tab === "emails" ? "emails" : tab === "availability" || tab === "events" ? "events" : "bookings";
  return <AdminCmsApp key={initialTab} workspace="bookings" initialTab={initialTab} />;
}
