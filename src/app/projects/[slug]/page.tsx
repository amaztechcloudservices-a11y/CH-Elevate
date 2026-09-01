import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import { PublicShell } from "@/components/public-shell";
import { projects } from "@/lib/site-data";

type RouteProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return projects.map((project) => ({ slug: project.slug })); }
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params; return { title: projects.find((p) => p.slug === slug)?.title ?? "Project" };
}
export default async function ProjectPage({ params }: RouteProps) {
  const { slug } = await params; const project = projects.find((p) => p.slug === slug); if (!project) notFound();
  return <PublicShell><PageHero title={project.title} description={project.category} image={project.image} /><section className="section"><div className="site-container detail-layout"><div><p className="section-label">Case study</p><h2>From a difficult question to a practical roadmap.</h2></div><div><p className="lead">{project.summary}</p><h3>The challenge</h3><p>Temporary preview content describes the context, decision, constraints, and leadership priorities.</p><h3>The approach</h3><p>The engagement combined analysis, working sessions, clear options, and a phased delivery plan.</p><h3>The outcome</h3><p>Approved client evidence and measurable results will replace this demonstration content.</p></div></div></section></PublicShell>;
}
