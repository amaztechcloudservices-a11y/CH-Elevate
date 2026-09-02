import type { Metadata } from "next";
import {
  Award,
  ChartNoAxesCombined,
  Handshake,
  Infinity,
  Scale,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {
  CtaBand,
  ElevatePageShell,
  IconCards,
  MethodBadges,
  SectionHeading,
  SplitFeature,
} from "@/components/elevate-sections";

export const metadata: Metadata = {
  title: "About CH Elevate",
  description: "Meet the practitioners behind CH Elevate and the principles, story, and methodologies that guide every engagement.",
};

const values = [
  { icon: ShieldCheck, title: "Integrity", body: "We say what we mean and always deliver what we promise. No overselling, no under-delivering." },
  { icon: Award, title: "Excellence", body: "We apply internationally recognised best practices rigorously, adapted intelligently to your context." },
  { icon: Handshake, title: "Partnership", body: "We are not vendors. We are partners invested in your outcomes, not just our deliverables." },
  { icon: ChartNoAxesCombined, title: "Accountability", body: "We set measurable goals, track progress transparently, and take ownership of results alongside you." },
  { icon: UsersRound, title: "Inclusion", body: "We design engagements that serve every stakeholder, from the boardroom to the front line." },
  { icon: Infinity, title: "Sustainability", body: "Every solution we build is designed to outlive our engagement, building capability that lasts." },
];

export default function AboutPage() {
  return (
    <ElevatePageShell pageSlug="about" className="elevate-about">
      <section className="elevate-section">
        <div className="ref-container">
          <SplitFeature image="/images/jamaican-business-coaching-team.webp" imageAlt="Jamaican business coach facilitating a collaborative team session around a conference table" reverse>
            <p className="ref-kicker">Where expertise meets execution</p>
            <h2>We do not just advise. We stand beside you until the work is done.</h2>
            <p>CH Elevate Consultancy Limited was established with a single conviction: organizations deserve more than a report. They deserve a partner one that combines the rigour of professional consultancy with the humanity of expert coaching and stays engaged until results are genuinely embedded.</p>
            <p>We are seasoned practitioners, including project managers, process engineers, organisational change specialists, and executive coaches. Our experience spans SMEs, multinational corporations, non-governmental organisations, and government bodies on the international stage. Our work is defined not by the frameworks we apply but by the outcomes we deliver and the capabilities we leave behind.</p>
            <div className="elevate-actions">
              <Link className="ref-button" href="#team">Meet the team</Link>
              <Link className="elevate-button-secondary" href="#methodology">Our approach</Link>
            </div>
          </SplitFeature>
        </div>
      </section>

      <section className="elevate-section elevate-section--tint">
        <div className="ref-container">
          <SectionHeading eyebrow="Our story" title="Built from practice. Driven by purpose." intro={<p>CH Elevate was not founded in a boardroom it was born from years of first-hand experience inside organisations struggling to deliver on their potential. Our founding team watched projects fail not for lack of ambition but for lack of structure. We saw talented leaders trapped in reactive operations, unable to build the systems that would set them free. And we decided to do something about it.</p>} />
          <div className="elevate-story">
            <article>
              <span>01</span>
              <h3>The problem we saw</h3>
              <p>Across sectors and geographies, we encountered a recurring pattern: organisations investing in strategies they could not execute, systems they could not sustain, and training that did not transfer to practice. The gap between knowing what to do and doing it consistently was costing time, money, momentum, morale, and mission.</p>
            </article>
            <article>
              <span>02</span>
              <h3>The response we built</h3>
              <p>We created CH Elevate as the partner we wished those organisations had: a consultancy that does not simply diagnose and depart; a coaching practice that does not stop at inspiration; an implementation team that stays until the change is real, the systems are running, and the team can sustain the gains independently.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="elevate-section">
        <div className="ref-container">
          <SectionHeading eyebrow="Our values" title="The values that guide every engagement" intro={<p>Six principles shape how we work.</p>} align="center" />
          <IconCards items={values} />
        </div>
      </section>

      <section className="elevate-section elevate-section--navy" id="methodology">
        <div className="ref-container">
          <SectionHeading eyebrow="Our methodological foundation" title="Globally recognised frameworks, applied with precision" intro={<p>CH Elevate does not invent new jargon. We apply the most respected, evidence-based methodologies in the world with the skill and experience to make them work in your environment.</p>} align="center" />
          <div className="elevate-methodology-grid">
            <article>
              <Scale aria-hidden="true" />
              <h3>Project Management</h3>
              <p>PMBOK (PMI), PRINCE2, Agile/Scrum, and hybrid delivery methodologies. We design governance that matches your maturity and culture, from lean PMO frameworks for agile environments to structured portfolio governance for complex programmes.</p>
            </article>
            <article>
              <ChartNoAxesCombined aria-hidden="true" />
              <h3>Process Improvement</h3>
              <p>Lean Six Sigma DMAIC, Value Stream Mapping, Root Cause Analysis, and process simulation. Our data-driven approach identifies root causes, not symptoms.</p>
            </article>
            <article>
              <UsersRound aria-hidden="true" />
              <h3>Change & Coaching</h3>
              <p>Prosci change-management practices, ICF-aligned executive coaching, and structured implementation support. Excellent change management makes organisations substantially more likely to achieve their objectives.</p>
            </article>
          </div>
          <MethodBadges items={["PMBOK / PMI", "PRINCE2", "Agile / Scrum", "Lean Six Sigma", "Prosci", "ICF-aligned coaching"]} />
        </div>
      </section>

      <section className="elevate-section" id="team">
        <div className="ref-container">
          <SectionHeading eyebrow="The people behind the results" title="Experienced practitioners. Genuine partners." intro={<p>Every CH Elevate consultant brings academic rigour, international professional certification, and real-world practitioner experience. We do not deploy junior staff to execute senior strategies. Every client engagement is led by a senior practitioner who understands your pressures and has delivered results in comparable contexts.</p>} align="center" />
          <div className="elevate-team-grid">
            <article>
              <div className="elevate-team-grid__visual">PMO</div>
              <span>Leadership profile</span>
              <h3>Principal Consultant, PMO & Portfolio Delivery</h3>
              <p>A certified Project Management Professional and PRINCE2 Practitioner with more than 15 years of experience in programme delivery across financial services, infrastructure, and government. Specialises in PMO design, governance frameworks, and delivery maturity advancement.</p>
            </article>
            <article>
              <div className="elevate-team-grid__visual">CHANGE</div>
              <span>Leadership profile</span>
              <h3>Lead Coach & Change Specialist</h3>
              <p>An ICF-aligned executive coach and Lean Six Sigma Black Belt with a background in large-scale organisational transformation. Supports leadership teams across non-profit, corporate, and public sector environments to build the mindset, habits, and systems required for sustained high performance.</p>
            </article>
          </div>
        </div>
      </section>

      <CtaBand
        title="Meet the team behind your next transformation."
        body="Start with a complimentary conversation and we will connect you with the senior practitioner best suited to your organisation."
        primary={{ label: "Book a discovery call", href: "/book" }}
        secondary={{ label: "Contact our team", href: "/contact" }}
      />
    </ElevatePageShell>
  );
}
