"use client";

import { useSiteContent } from "@/lib/use-site-content";

export function EditablePhone({ as = "link" }: { as?: "link" | "strong" }) {
  const { settings } = useSiteContent();
  if (as === "strong") return <strong>{settings.footerPhone}</strong>;
  return <a href={`tel:${settings.footerPhone.replace(/[^\d+]/g, "")}`}>{settings.footerPhone}</a>;
}

export function EditableEmail() {
  const { settings } = useSiteContent();
  return <a href={`mailto:${settings.footerEmail}`}>{settings.footerEmail}</a>;
}
