export type AdminWorkspace = "website" | "bookings" | "courses";

export const adminWorkspaces = {
  bookings: { label: "Booking administration", href: "/admin/bookings", tabs: ["bookings", "events", "emails"] },
  courses: { label: "Course Registration", href: "/admin/courses", tabs: ["courses"] },
  website: { label: "Website Management", href: "/admin/website", tabs: ["overview", "global", "navigation", "hero", "pages", "forms", "inbox"] },
} as const;

export function legacyAdminDestination(tab?: string) {
  if (tab === "bookings") return "/admin/bookings";
  if (tab === "availability" || tab === "events") return "/admin/bookings?tab=events";
  if (tab === "emails") return "/admin/bookings?tab=emails";
  if (tab === "courses") return "/admin/courses";
  return adminWorkspaces.website.tabs.some((value) => value === tab) && tab !== "overview"
    ? `/admin/website?tab=${tab}` : "/admin/website";
}
