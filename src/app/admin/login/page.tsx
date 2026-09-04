import type { Metadata } from "next";
import Link from "next/link";

import { AdminLoginForm } from "@/components/admin-login-form";
import { BrandLogo } from "@/components/brand-logo";

type AdminArea = "bookings" | "courses" | "website";

type AdminLoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

const areaContent: Record<AdminArea, { title: string; heading: string; description: string; buttonLabel: string }> = {
  bookings: {
    title: "Booking Administration Sign In",
    heading: "Booking administration sign in.",
    description: "Sign in with the client administrator account to review consultation requests, update booking statuses, and manage availability.",
    buttonLabel: "Sign in to booking administration",
  },
  courses: {
    title: "Course Administration Sign In",
    heading: "Course administration sign in.",
    description: "Sign in with the client administrator account to review student registrations, manage courses and cohorts, and administer enrolment records.",
    buttonLabel: "Sign in to course administration",
  },
  website: {
    title: "Website Administration Sign In",
    heading: "Website administration sign in.",
    description: "Sign in with the client administrator account to manage website content, images, navigation, forms, and enquiries.",
    buttonLabel: "Sign in to website administration",
  },
};

function getAdminArea(next: string | string[] | undefined): AdminArea {
  const destination = Array.isArray(next) ? next[0] : next;
  if (!destination) return "website";

  try {
    const url = new URL(destination, "https://admin.local");
    if (url.pathname === "/admin/bookings") return "bookings";
    if (url.pathname === "/admin/courses") return "courses";
    const tab = url.searchParams.get("tab");
    if (tab === "bookings" || tab === "courses") return tab;
  } catch {
    return "website";
  }

  return "website";
}

export async function generateMetadata({ searchParams }: AdminLoginPageProps): Promise<Metadata> {
  const { next } = await searchParams;
  return {
    title: areaContent[getAdminArea(next)].title,
    robots: { index: false, follow: false },
  };
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { next } = await searchParams;
  const content = areaContent[getAdminArea(next)];

  return (
    <main className="admin-login">
      <section>
        <Link className="admin-login__brand" href="/">
          <BrandLogo className="brand-logo__image" priority />
        </Link>
        <p className="section-label">Secure administration</p>
        <h1>{content.heading}</h1>
        <p>{content.description}</p>
        <AdminLoginForm buttonLabel={content.buttonLabel} />
      </section>
    </main>
  );
}
