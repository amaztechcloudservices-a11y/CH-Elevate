import type { Metadata } from "next";

import { ProjectsCollection } from "@/components/content-collections";
import { PageHero } from "@/components/page-hero";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Projects" };
export default function ProjectsPage() {
  return <PublicShell><PageHero title="Strategy is valuable when it changes what happens next." description="A preview collection of consulting engagements and practical outcomes." image="/images/people-working-on-business-charts.jpg" /><section className="section"><div className="site-container"><ProjectsCollection /></div></section></PublicShell>;
}
