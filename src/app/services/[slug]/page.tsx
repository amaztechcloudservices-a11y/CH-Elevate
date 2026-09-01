import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import { PublicShell } from "@/components/public-shell";
import { services } from "@/lib/site-data";

type RouteProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find((item) => item.slug === slug);
  return { title: service?.title ?? "Service" };
}

export default async function ServicePage({ params }: RouteProps) {
  const { slug } = await params;
  const service = services.find((item) => item.slug === slug);
  if (!service) notFound();

  return (
    <PublicShell>
      <PageHero title={service.title} description={service.description} image="/images/people-working-on-business-charts.jpg" />
      <section className="section">
        <div className="site-container detail-layout">
          <div><p className="section-label">Service overview</p><h2>Clear analysis. Practical choices. Disciplined delivery.</h2></div>
          <div>
            <p className="lead">{service.detail}</p>
            <ul className="check-list">
              {["A clearly defined decision and scope", "Evidence-led analysis and options", "An actionable roadmap with ownership", "Implementation support when required"].map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
            </ul>
            <Link className="button button--accent" href="/book">Discuss this service <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
