import type { Metadata } from "next";
import Link from "next/link";
import {
  BriefcaseBusiness,
  Check,
  CircleGauge,
  GraduationCap,
  Handshake,
  Network,
  Settings2,
  UsersRound,
  X,
} from "lucide-react";

import {
  CtaBand,
  ElevatePageShell,
  IconCards,
  MethodBadges,
  ProcessSteps,
  SectionHeading,
  SplitFeature,
  StatsBand,
} from "@/components/elevate-sections";

export const metadata: Metadata = {
  title: "Services",
  description: "PMO consultancy, process efficiency improvement, coaching, training, and implementation support from CH Elevate.",
};

const pmoOfferings = [
  { icon: CircleGauge, title: "PMO Maturity Assessment", body: "A comprehensive diagnostic of governance, reporting, tools, team competency, and stakeholder alignment that produces a clear scorecard and prioritised improvement roadmap." },
  { icon: Network, title: "100-Day PMO Stand-Up", body: "A structured intensive that takes your organisation from zero project governance to a fully operational PMO in 100 days, including the first quarterly reporting cycle." },
  { icon: BriefcaseBusiness, title: "Fractional PMO Leadership", body: "Senior PMO practitioners embed flexibly in your team to provide strategic leadership, stakeholder management, and programme oversight while internal capability grows." },
  { icon: GraduationCap, title: "PMO Training & Certification", body: "PMP® Exam Preparation, PRINCE2 Foundation and Practitioner preparation, Agile/Scrum fundamentals, and our applied Project Delivery Masterclass." },
];

const coaching = [
  { icon: UsersRound, title: "1:1 Executive Coaching", body: "Personalised, confidential coaching for senior leaders focused on strategic clarity, decision-making effectiveness, leadership presence, and the capability to drive change at scale." },
  { icon: Handshake, title: "Team & Group Coaching", body: "Structured programmes for management teams, cross-functional project teams, and delivery units that build collective capability, alignment, and shared accountability." },
  { icon: Settings2, title: "Implementation Support", body: "Hands-on support during the critical implementation phase. We resolve blockers, coach through challenges, reinforce new behaviours, and prevent stalled change." },
];

const comparisonRows = [
  ["Organisational assessment", true, true, true],
  ["Recommendations report", true, true, true],
  ["Implementation support", false, true, true],
  ["PMO / process build", false, true, true],
  ["Coaching & embedding", false, "Quarterly", "Ongoing"],
  ["Training & capability build", false, "Optional", true],
  ["Dedicated senior consultant", false, true, true],
  ["Outcome guarantee", false, false, true],
  ["Duration", "2 to 4 weeks", "3 to 6 months", "6 to 18 months"],
] as const;

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check aria-label="Included" />;
  if (value === false) return <X aria-label="Not included" />;
  return <>{value}</>;
}

export default function ServicesPage() {
  return (
    <ElevatePageShell pageSlug="services" className="elevate-services">
      <section className="elevate-section elevate-services__overview">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Three disciplines that work together"
            title="Transformation requires the right systems and the right people to run them."
            intro={<p>CH Elevate&apos;s service suite combines structured consultancy, process engineering, and personalised coaching into an integrated offering. It provides the strategy and execution capability needed to bring that strategy to life.</p>}
          />
        </div>
      </section>

      <section className="elevate-section elevate-section--tint" id="pmo">
        <div className="ref-container">
          <SplitFeature image="/images/people-working-on-business-charts.jpg" imageAlt="Project governance dashboard and planning materials">
            <p className="ref-kicker">PMO Consultancy & Training</p>
            <h2>Build a Project Management Office that delivers and keeps delivering.</h2>
            <p>Research from the Project Management Institute indicates that organisations without a structured PMO waste an average of 11.4% of total project investment through poor performance, while mature PMOs complete 38% more projects on time and on budget. A well-designed PMO is not bureaucracy. It is the governance infrastructure that turns reactive delivery into consistent performance.</p>
            <p>CH Elevate specialises in PMO design, launch, and optimisation across sectors and scales. Whether building your first PMO, upgrading a struggling Project Office, or establishing public-sector delivery capability, we bring the methodology, experience, and hands-on support to make it work.</p>
          </SplitFeature>
          <div className="elevate-subsection">
            <h3>Our PMO service offerings</h3>
            <IconCards items={pmoOfferings} columns={2} />
            <div className="elevate-centered-action"><Link className="ref-button" href="/contact?subject=PMO%20Consultancy">Request a PMO assessment</Link></div>
          </div>
        </div>
      </section>

      <section className="elevate-section elevate-process-service" id="process">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Process Efficiency Improvement"
            title="Eliminate the waste that costs time, money, and competitive advantage."
            intro={<><p>In many organisations, 20% to 30% of operational effort is consumed by normalised inefficiency, including duplicated steps, manual workarounds, approval bottlenecks, and rework cycles that nobody has stopped to question.</p><p>Our practice is grounded in Lean Six Sigma DMAIC, combined with change-management principles that ensure new workflows are genuinely adopted. We do not produce flowcharts and leave. We implement, test, measure, and embed.</p></>}
          />
          <ProcessSteps items={[
            { number: "D", title: "Define", body: "Clarify the problem, improvement scope, stakeholders, and business impact. Nothing is assumed." },
            { number: "M", title: "Measure", body: "Baseline current performance, map process flows, quantify waste, and establish success metrics." },
            { number: "A", title: "Analyse", body: "Separate symptoms from root causes using Fishbone Analysis, Pareto Charts, and Statistical Process Control where appropriate." },
            { number: "I", title: "Improve", body: "Redesign workflows, optimise approvals, identify automation, establish SOPs, and implement supporting technology." },
            { number: "C", title: "Control", body: "Embed controls, monitoring, governance, and internal ownership so improvement holds independently." },
          ]} />
          <div className="elevate-centered-action"><Link className="ref-button" href="/contact?subject=Process%20Improvement">Request a process diagnostic</Link></div>
        </div>
      </section>

      <StatsBand
        light
        items={[
          { value: "20% to 30%", label: "Operational effort commonly consumed by normalised inefficiency" },
          { value: "5 stages", label: "One disciplined DMAIC improvement spine" },
          { value: "1 goal", label: "A measurable improvement your team can sustain" },
        ]}
      />

      <section className="elevate-section elevate-section--tint" id="coaching">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Coaching & Implementation Support"
            title="The bridge between knowing what to do and actually doing it."
            intro={<><p>PwC and International Coaching Federation research reports a median return of seven times the investment in coaching. Prosci research also shows that organisations with excellent change management are seven times more likely to achieve transformation objectives.</p><p>At CH Elevate, coaching is the mechanism through which improvement is embedded and sustained. We develop the leaders who drive change while building the systems and behaviours that carry it forward.</p></>}
            align="center"
          />
          <IconCards items={coaching} />
          <div className="elevate-centered-action"><Link className="ref-button" href="/programmes#individual">Explore coaching options</Link></div>
        </div>
      </section>

      <section className="elevate-section" id="engagement-models">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Flexible engagement models"
            title="From focused diagnostics to full transformation partnerships"
            intro={<p>Every engagement begins with a complimentary discovery call. We then propose a model tailored to your scope, timeline, and budget. Pricing is transparent and agreed in advance, with no hidden fees or unapproved scope creep.</p>}
            align="center"
          />
          <div className="elevate-comparison" role="region" aria-label="Engagement model comparison" tabIndex={0}>
            <table>
              <thead><tr><th>Feature</th><th>Diagnostic</th><th>Implementation</th><th className="is-featured">Transformation</th></tr></thead>
              <tbody>
                {comparisonRows.map(([label, diagnostic, implementation, transformation]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td><FeatureValue value={diagnostic} /></td>
                    <td><FeatureValue value={implementation} /></td>
                    <td className="is-featured"><FeatureValue value={transformation} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="elevate-section elevate-section--navy">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Our methodological credentials"
            title="Globally adopted frameworks. Practitioner-level application."
            intro={<p>Every CH Elevate engagement is grounded in widely adopted and rigorously tested frameworks. Our team holds active certifications and practitioner experience across these disciplines.</p>}
            align="center"
          />
          <MethodBadges items={["PMP® / PMBOK", "PRINCE2®", "Lean Six Sigma", "Prosci ADKAR®", "ICF Coaching"]} />
        </div>
      </section>

      <CtaBand
        title="Not sure where to start?"
        body="During your complimentary 30-minute call, a senior consultant will understand your context, current challenges, and transformation goals. There is no obligation or sales script. It is an expert conversation to identify the right service or combination of services."
        primary={{ label: "Book your free discovery call", href: "/book" }}
        secondary={{ label: "View our programmes", href: "/programmes" }}
      />
    </ElevatePageShell>
  );
}
