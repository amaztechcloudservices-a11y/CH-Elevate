import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Pricing" };
const plans = [
  ["Focused session", "A structured consultation for one defined decision.", "Single advisory session"],
  ["Advisory sprint", "Focused analysis and a practical action roadmap.", "Short, outcome-led engagement"],
  ["Delivery partnership", "Ongoing advisory and implementation support.", "Phased engagement"],
] as const;
export default function PricingPage() {
  return <PublicShell><PageHero title="Choose the right level of support." description="Temporary package structures for preview. Final pricing will follow the approved service model." image="/images/two-casual-businessmen-using-tablet.jpg" /><section className="section"><div className="site-container pricing-grid">{plans.map(([title, copy, label], index) => <article className={index === 1 ? "pricing-card pricing-card--featured" : "pricing-card"} key={title}><p>{label}</p><h2>{title}</h2><p>{copy}</p><ul>{["Clear scope", "Defined deliverables", "Practical recommendations", "Follow-up summary"].map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}</ul><Link className={index === 1 ? "button button--accent" : "button button--outline"} href="/book">Discuss this option</Link></article>)}</div></section></PublicShell>;
}
