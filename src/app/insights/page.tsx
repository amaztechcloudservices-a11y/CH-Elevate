import type { Metadata } from "next";

import { InsightsCollection } from "@/components/content-collections";
import { PageHero } from "@/components/page-hero";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Insights" };
export default function InsightsPage() {
  return <PublicShell><PageHero title="Useful thinking for growing organisations." description="Practical notes on strategy, finance, operations, projects, risk, and growth." image="/images/office-desk-table-with-supplies-coffee-cup-and-flower-top-view.jpg" /><section className="section"><div className="site-container"><InsightsCollection /></div></section></PublicShell>;
}
