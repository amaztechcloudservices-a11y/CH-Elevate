import type { Metadata } from "next";
import {
  BriefcaseBusiness,
  CalendarRange,
  GraduationCap,
  Presentation,
  Sparkles,
  UsersRound,
} from "lucide-react";

import {
  CtaBand,
  ElevatePageShell,
  IconCards,
  SectionHeading,
} from "@/components/elevate-sections";
import { CourseRegistration } from "@/components/course-registration";

export const metadata: Metadata = {
  title: "Programmes",
  description: "Structured executive, cohort, masterclass, and organisational transformation programmes from CH Elevate.",
};

const individual = [
  {
    icon: Sparkles,
    title: "Executive Clarity Programme",
    body: "Format: 1:1 coaching · Onsite or remote · 12 weeks, extendable. A personalised engagement for senior leaders who need strategic clarity, decision support, and the leadership capability to drive sustained change. Includes a leadership diagnostic, bi-weekly coaching, and optional 360° stakeholder feedback.",
  },
  {
    icon: BriefcaseBusiness,
    title: "PMO Stand-Up Accelerator",
    body: "Format: 1:1 consultancy · Onsite · 100 days. A dedicated senior PMO consultant works alongside your team to design, build, configure, and launch a fully operational Project Management Office, from governance framework to first quarterly review.",
  },
  {
    icon: UsersRound,
    title: "Leader-as-Coach Programme",
    body: "Format: 1:1 coaching · Blended · Six months. For managers and team leaders developing coaching skills for their own teams. Combines methodology, personal coaching, and supported workplace application to multiply team effectiveness.",
  },
];

const group = [
  {
    icon: CalendarRange,
    title: "Business Performance CLUB",
    body: "Group coaching · 8 to 12 organisations · Ongoing quarterly. SME leaders build a rigorous 90-day performance plan covering financial targets, operational priorities, and leadership goals, then meet monthly to review progress and sustain momentum.",
  },
  {
    icon: UsersRound,
    title: "Delivery Leaders Roundtable",
    body: "Peer group · 10 to 15 professionals · Ongoing monthly. Project managers, programme leaders, and PMO professionals explore governance, stakeholders, portfolio prioritisation, and team performance through expert facilitation and peer problem-solving.",
  },
  {
    icon: Presentation,
    title: "Team Performance Intensive",
    body: "Group workshop · Teams of 6 to 20 · Two days onsite. Teams clarify roles, align around shared goals, and establish collaborative habits through behavioural insight, structured coaching, and a practical performance plan.",
  },
];

const masterclasses = [
  {
    icon: GraduationCap,
    title: "Project Management MasterClass",
    body: "Blended group learning · 12 weeks. Covers the PMBOK framework, stakeholder management, project risk, financial management, and communication. Includes a 35-hour contact certificate suitable for PMP® eligibility and builds practical capability beyond exam technique.",
  },
  {
    icon: GraduationCap,
    title: "Process Improvement MasterClass",
    body: "Blended group learning · 12 weeks. A DMAIC-based programme covering process mapping, measurement, root-cause analysis, solution design, implementation, and control. Participants complete a live process improvement project.",
  },
  {
    icon: GraduationCap,
    title: "Leadership & Change MasterClass",
    body: "Blended group learning · 12 weeks. Combines leadership theory, coaching skills, Prosci ADKAR change fundamentals, and practical application for emerging leaders and experienced managers.",
  },
];

export default function ProgrammesPage() {
  return (
    <ElevatePageShell pageSlug="programmes" className="elevate-programmes">
      <section className="elevate-section">
        <div className="ref-container">
          <SectionHeading
            eyebrow="From rapid sprints to long-term partnerships"
            title="Meet leaders and organisations wherever they are."
            intro={<p>CH Elevate&apos;s programme portfolio ranges from focused improvement sprints to sustained, multi-year transformation partnerships. Every programme is built on the same four-stage model: Diagnose, Build, Embed, Sustain.</p>}
            align="center"
          />
          <div className="elevate-category-pills" aria-label="Programme categories">
            <a href="#individual">Individual</a><a href="#group">Group & cohort</a><a href="#masterclasses">MasterClasses</a><a href="#long-term">Long-term</a><a href="#tailored">Tailored</a>
          </div>
        </div>
      </section>

      <section className="elevate-section elevate-section--tint" id="individual">
        <div className="ref-container">
          <SectionHeading eyebrow="Individual & executive programmes" title="Bespoke, high-impact engagements for senior leaders and professionals" align="center" />
          <IconCards items={individual} />
        </div>
      </section>

      <section className="elevate-section" id="group">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Group & cohort programmes"
            title="The power of collective learning, structured for real-world impact"
            intro={<p>Our group programmes create the community, collaboration, and consistent action that individual engagements alone cannot replicate. Every programme includes facilitated sessions, structured accountability, and access to the CH Elevate resource library.</p>}
            align="center"
          />
          <IconCards items={group} />
        </div>
      </section>

      <section className="elevate-section elevate-section--navy" id="masterclasses">
        <div className="ref-container">
          <SectionHeading
            eyebrow="12-week MasterClass tracks"
            title="Rigorous learning for high-potential professionals"
            intro={<p>Curriculum-driven programmes combine structured content, practical application assignments, expert facilitation, and peer engagement to build deep capability in a specific discipline.</p>}
            align="center"
          />
          <IconCards items={masterclasses} />
        </div>
      </section>

      <section className="elevate-section" id="long-term">
        <div className="ref-container">
          <SectionHeading eyebrow="Long-term transformation programmes" title="Sustained support for organisations ready to transform" intro={<p>These programmes combine PMO, Process Efficiency, and Coaching into a coherent partnership that delivers the deep, sustained change shorter engagements cannot.</p>} align="center" />
          <div className="elevate-programme-features">
            <article>
              <span>6 to 18 months · Full consultancy + coaching</span>
              <h3>Organisational Transformation Partnership</h3>
              <p>Our flagship model begins with a comprehensive diagnostic, followed by multi-phase implementation covering PMO establishment or optimisation, process efficiency, leadership development, and embedded coaching. Progress is measured against agreed KPIs at every stage, and support continues until agreed outcomes are genuinely achieved.</p>
              <a className="ref-button" href="/book">Discuss a partnership</a>
            </article>
            <article>
              <span>12 months · Consultancy + training + coaching</span>
              <h3>Capacity Building Programme</h3>
              <p>Purpose-designed for non-profits and public-sector bodies that need internal delivery capability, not only external expertise. Combines diagnostic work, framework design, accredited training, coaching for internal champions, and structured knowledge transfer so your organisation owns the system independently.</p>
              <a className="ref-button" href="/book">Explore capacity building</a>
            </article>
          </div>
        </div>
      </section>

      <CourseRegistration />

      <section className="elevate-tailored" id="tailored">
        <div className="ref-container">
          <p className="ref-kicker ref-kicker--light">Every programme can be tailored</p>
          <h2>Your organisation does not have to fit a template.</h2>
          <p>CH Elevate&apos;s standard programmes are modular and adaptable. If your context, scale, or requirements do not fit a structured offering, we will design a bespoke programme around your operating environment, people, and goals, drawing on the same disciplines, methodologies, and frameworks.</p>
          <a className="elevate-button-secondary elevate-button-secondary--light" href="/contact">Explore the possibilities</a>
        </div>
      </section>

      <CtaBand
        title="Find the right programme for your organisation."
        body="Whether you are an individual leader, a team building shared performance capability, or an organisation ready for transformation, we can structure a programme around the outcomes you need."
        primary={{ label: "Book a discovery call", href: "/book" }}
        secondary={{ label: "Ask about a programme", href: "/contact" }}
      />
    </ElevatePageShell>
  );
}
