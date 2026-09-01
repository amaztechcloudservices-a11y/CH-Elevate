import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { PublicShell } from "@/components/public-shell";
import { posts } from "@/lib/site-data";

type RouteProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return posts.map((post) => ({ slug: post.slug })); }
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params; return { title: posts.find((p) => p.slug === slug)?.title ?? "Insight" };
}
export default async function InsightPage({ params }: RouteProps) {
  const { slug } = await params; const post = posts.find((p) => p.slug === slug); if (!post) notFound();
  return <PublicShell><article className="article-page"><header><div className="site-container"><p className="section-label section-label--light">{post.category}</p><h1>{post.title}</h1><p>{post.date} · 6 minute read</p></div></header><div className="article-page__image"><Image src={post.image} alt="" fill priority sizes="100vw" /></div><div className="article-body"><p className="lead">{post.excerpt}</p><h2>Start with the decision, not the document.</h2><p>Strategy becomes useful when it is expressed as choices, priorities, measures, and actions that people can recognise in their day-to-day work.</p><p>Temporary article content demonstrates the reading experience. Final articles will be managed through the integrated administration dashboard.</p><blockquote>Clarity is not the absence of complexity. It is the ability to act despite it.</blockquote><h2>Translate the choice into operating reality.</h2><p>Assign ownership, connect measures to decisions, establish a review rhythm, and make the few critical trade-offs visible across the organisation.</p></div></article></PublicShell>;
}
