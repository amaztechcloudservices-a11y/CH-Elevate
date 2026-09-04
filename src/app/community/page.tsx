import type { Metadata } from "next";
import {
  BadgePercent,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  Network,
  Radio,
} from "lucide-react";

import {
  CtaBand,
  ElevatePageShell,
  IconCards,
  SectionHeading,
  SplitFeature,
} from "@/components/elevate-sections";

export const metadata: Metadata = {
  title: "Join the Community",
  description: "A curated professional network for leaders, delivery professionals, operations specialists, and change practitioners.",
};

const benefits = [
  { icon: BookOpen, title: "Expert Resource Library", body: "A curated library of frameworks, templates, tools, case studies, and guides, updated continuously by the CH Elevate team." },
  { icon: Radio, title: "Monthly Expert Webinars", body: "Live sessions with CH Elevate senior consultants and external specialists covering project delivery, process improvement, and leadership." },
  { icon: Network, title: "Peer Network Access", body: "Connect with an international community facing similar challenges, exchange insight, ask questions, and build professional relationships." },
  { icon: CalendarCheck, title: "Quarterly Planning Sessions", body: "Use the structured 90-day planning curriculum from our Business Performance CLUB to plan your next quarter with precision." },
  { icon: GraduationCap, title: "Member Masterclasses", body: "Exclusive short masterclasses on high-value professional topics, delivered live and available on demand." },
  { icon: BadgePercent, title: "Member Discounts", body: "Priority access to new programmes and a guaranteed 10% member discount on paid training, workshops, and consultancy engagements." },
];

const events = [
  ["PMO Fundamentals Webinar", "An introduction to PMO design principles for professionals new to governance frameworks, hosted by a senior consultant.", "Monthly webinar · Free to all members"],
  ["Quarterly Business Planning Workshop", "A facilitated 90-day planning session for business owners, operations leaders, and senior managers.", "Quarterly · Professional and above"],
  ["Delivery Leaders Roundtable", "A peer discussion forum for project and programme managers, facilitated by a senior consultant.", "Monthly · Professional and above"],
  ["Process Improvement Masterclass", "A half-day introduction to Lean Six Sigma DMAIC for operations professionals.", "Bi-annual · Pay-per-event available"],
  ["Annual CH Elevate Summit", "A full-day gathering with keynotes, breakout workshops, networking, and recognition of organisational excellence.", "Annual · All members"],
];

export default function CommunityPage() {
  return (
    <ElevatePageShell pageSlug="community" className="elevate-community">
      <section className="elevate-section">
        <div className="ref-container">
          <SplitFeature image="/images/community-ceo-manager-meeting.webp" imageAlt="A CEO and manager reviewing a business plan together" reverse>
            <p className="ref-kicker">A professional community</p>
            <h2>Performance does not grow in isolation.</h2>
            <p>The CH Elevate Community is a curated network for leaders, project professionals, operations specialists, and organisational change practitioners committed to continuous development, peer learning, and building organisations that deliver.</p>
            <p>Whether you are a seasoned executive, an emerging leader, or a project professional elevating your practice, you gain a peer group that understands your challenges. You also receive expert resources, events, and facilitated conversations to help solve them.</p>
            <a className="ref-button" href="#membership">Join the community today</a>
          </SplitFeature>
        </div>
      </section>

      <section className="elevate-section elevate-section--tint">
        <div className="ref-container">
          <SectionHeading eyebrow="Membership benefits" title="Six ways membership accelerates your development" align="center" />
          <IconCards items={benefits} />
        </div>
      </section>

      <section className="elevate-section" id="membership">
        <div className="ref-container">
          <SectionHeading eyebrow="Community membership tiers" title="Join at the level that fits you best" align="center" />
          <div className="elevate-pricing-grid">
            <article>
              <span>Foundation</span><strong>Free</strong><p>The perfect entry point to the CH Elevate Community.</p>
              <ul><li>Community discussion forum</li><li>Monthly newsletter with resources and insights</li><li>Selected free webinars</li><li>Introductory resource library access</li></ul>
              <a className="elevate-button-secondary" href="/contact?subject=Community%20Foundation">Join free</a>
            </article>
            <article className="is-featured">
              <span>Professional</span><strong>Contact for pricing</strong><p>For individual professionals committed to continuous development.</p>
              <ul><li>All Foundation benefits</li><li>Full resource library</li><li>All webinars live and on demand</li><li>Quarterly planning curriculum</li><li>Member Masterclasses</li><li>10% engagement discount</li></ul>
              <a className="ref-button" href="/contact?subject=Professional%20Membership">Apply now</a>
            </article>
            <article>
              <span>Organisational</span><strong>Bespoke pricing</strong><p>For teams investing in collective development.</p>
              <ul><li>Professional benefits for up to 10 members</li><li>Organisational quarterly planning session</li><li>Team account management</li><li>Annual one-hour development consultation</li><li>Priority programme access</li><li>Dedicated community account manager</li></ul>
              <a className="elevate-button-secondary" href="/contact?subject=Organisational%20Membership">Contact us</a>
            </article>
          </div>
        </div>
      </section>

      <section className="elevate-section elevate-section--navy elevate-community__events-section">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Upcoming community events"
            title="Connect, learn, and grow with the CH Elevate Community"
            intro={<p>Events sit at the heart of the community. Professional members and above receive access to the full schedule, while Foundation members can join selected sessions or use pay-per-event access.</p>}
            align="center"
          />
          <div className="elevate-events">
            {events.map(([title, description, frequency]) => (
              <article key={title}><div><span>{frequency}</span><h3>{title}</h3><p>{description}</p></div><a href={`/contact?subject=${encodeURIComponent(title)}`}>Register interest</a></article>
            ))}
          </div>
          <p className="elevate-disclosure elevate-disclosure--standalone">Dates will be added when the launch calendar is approved.</p>
        </div>
      </section>

      <CtaBand
        title="Your community is waiting. Join CH Elevate today."
        body="Wherever you are in your professional journey, the CH Elevate Community offers resources, peer support, and expert guidance to help you develop further, faster."
        primary={{ label: "Join the community for free", href: "/contact?subject=Community%20Foundation" }}
        secondary={{ label: "Explore professional membership", href: "/contact?subject=Professional%20Membership" }}
      />
    </ElevatePageShell>
  );
}
