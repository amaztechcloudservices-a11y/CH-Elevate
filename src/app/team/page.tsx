import type { Metadata } from "next";
import Image from "next/image";

import { PageHero } from "@/components/page-hero";
import { PublicShell } from "@/components/public-shell";
import { team } from "@/lib/site-data";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <PublicShell>
      <PageHero title="Experience is strongest when it works together." description="Meet the temporary preview team behind the consulting practice." image="/images/business-team-talk-eat-and-drink-on-stairs.jpg" />
      <section className="section">
        <div className="site-container">
          <div className="section-heading-row"><div><p className="section-label">Our team</p><h2>People who make the work practical.</h2></div></div>
          <div className="team-grid">
            {team.map(([name, role, image]) => <article key={name}><div><Image src={`/images/${image}`} alt="" fill sizes="25vw" /></div><h2>{name}</h2><p>{role}</p></article>)}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
