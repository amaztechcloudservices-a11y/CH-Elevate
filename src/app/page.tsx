import {
  Building2,
  Factory,
  GraduationCap,
  Handshake,
  Landmark,
  Settings2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {
  Checklist,
  CtaBand,
  ElevatePageShell,
  IconCards,
  ProcessSteps,
  QuoteBand,
  SectionHeading,
  SplitFeature,
  StatsBand,
} from "@/components/elevate-sections";

const services = [
  {
    icon: Landmark,
    title: "PMO Consultancy & Training",
    body: "Design, launch, and optimise your Project Management Office with globally recognised frameworks and accredited training tracks.",
    href: "/services#pmo",
  },
  {
    icon: Settings2,
    title: "Process Efficiency Improvement",
    body: "Diagnose operational bottlenecks, eliminate waste, and engineer workflows that deliver more with less friction and greater consistency.",
    href: "/services#process",
  },
  {
    icon: Handshake,
    title: "Coaching & Implementation Support",
    body: "Embed the changes that matter through personalised coaching and guided implementation that keeps leaders and teams moving forward.",
    href: "/services#coaching",
  },
];

const audiences = [
  {
    icon: Building2,
    title: "SMEs & Growing Businesses",
    body: "Growing fast but lacking the structure to scale sustainably? We build project governance, streamline operations, and develop the leadership bandwidth to support expansion without the overhead of a full internal PMO team.",
    bullets: ["Fractional PMO leadership tailored for lean teams", "Operational efficiency sprints with measurable ROI"],
  },
  {
    icon: Factory,
    title: "Corporate & Enterprise Teams",
    body: "Large organisations often struggle less with strategy and more with execution consistency. We strengthen governance, accelerate project throughput, and build high-performance delivery cultures.",
    bullets: ["Portfolio and programme governance uplift", "Executive coaching aligned to strategic objectives"],
    dark: true,
  },
  {
    icon: UsersRound,
    title: "Non-Profits & NGOs",
    body: "Mission-driven organisations deserve systems as strong as their purpose. We help NGOs build funder-ready delivery frameworks and operationally sustainable programmes.",
    bullets: ["Funder-ready project reporting systems", "Capacity building and team development programmes"],
    dark: true,
  },
  {
    icon: GraduationCap,
    title: "Government & Public Sector",
    body: "Public sector delivery demands rigour, transparency, and value-for-money. We align our work to recognised standards while building internal delivery capability.",
    bullets: ["PRINCE2-aligned governance and delivery standards", "Public sector capacity building and knowledge transfer"],
  },
];

export default function Home() {
  return (
    <ElevatePageShell pageSlug="home" className="elevate-home">
      <section className="elevate-intro elevate-section">
        <div className="ref-container elevate-intro__grid">
          <div>
            <p className="ref-kicker">Strategy, structure & sustained change</p>
            <h2>For leaders who mean business.</h2>
          </div>
          <div>
            <p>CH Elevate Consultancy Limited partners with organisations across every sector to build the systems, skills, and leadership capacity that drive measurable, lasting results.</p>
            <p>Whether you are establishing a Project Management Office, streamlining operational workflows, or embedding transformational change, we deliver expert consultancy and hands-on coaching that goes beyond the advisory brief. We stay until results are real.</p>
            <div className="elevate-actions">
              <Link className="ref-button" href="/book">Book a discovery call</Link>
              <Link className="elevate-button-secondary" href="/services">Explore our services</Link>
            </div>
          </div>
        </div>
      </section>

      <StatsBand
        title="Trusted by organisations that demand results"
        items={[
          { value: "38%", label: "More projects completed on time and on budget with a structured PMO" },
          { value: "7×", label: "Median return on coaching investment" },
          { value: "88%", label: "Of organisations with excellent change management meet or exceed objectives" },
        ]}
      />

      <section className="elevate-section elevate-home__services">
        <div className="ref-container">
          <SectionHeading
            eyebrow="What we do"
            title="Three disciplines. One integrated approach."
            intro={<p>Every engagement at CH Elevate is built on the principle that advice without implementation is insufficient. Our three core disciplines work in concert, creating the systems that deliver performance and the capability that sustains it.</p>}
            align="center"
          />
          <IconCards items={services} />
          <div className="elevate-centered-action"><Link className="ref-button" href="/services">View all services</Link></div>
        </div>
      </section>

      <section className="elevate-section elevate-section--tint">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Our signature framework"
            title="The CH Elevate Method: Diagnose. Build. Embed. Sustain."
            intro={<><h3>A proven four-stage engagement model designed for lasting impact</h3><p>Every CH Elevate engagement follows a disciplined, four-stage model. We do not simply deliver a report and depart. We work alongside your organisation to assess, build, coach, and ensure that every improvement holds long after our engagement ends.</p></>}
            align="center"
          />
          <ProcessSteps items={[
            { number: "01", title: "Diagnose", body: "We begin with an in-depth organisational assessment. We map current capabilities, identify gaps, and clarify what success looks like for your specific context. No assumptions. No templates applied blind." },
            { number: "02", title: "Build", body: "Using PMBOK, PRINCE2, Lean Six Sigma DMAIC, and structured change-management frameworks, we design and implement the systems, governance structures, and processes your organisation needs." },
            { number: "03", title: "Embed", body: "Implementation without adoption fails. Personalised coaching and guided support ensure new systems, processes, and behaviours become part of daily operations instead of sitting in a binder on a shelf." },
            { number: "04", title: "Sustain", body: "We build internal capability so gains do not depend on our continued presence. We measure outcomes, reinforce adoption, and hand over ownership so your team is stronger and fully in control." },
          ]} />
        </div>
      </section>

      <section className="elevate-section elevate-home__audiences">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Who we serve"
            title="Built for every sector that demands performance"
            intro={<p>We serve SMEs, non-profit and NGO leaders, corporate enterprise teams, and government and public sector bodies. We deliver bespoke consultancy shaped around your operating environment, not a one-size template.</p>}
            align="center"
          />
          <IconCards items={audiences} columns={2} />
        </div>
      </section>

      <section className="elevate-section elevate-section--tint elevate-home__why">
        <div className="ref-container">
          <SplitFeature image="/images/ch-elevate-jamaican-consultant-client.png" imageAlt="Jamaican female business consultant meeting with a client">
            <p className="ref-kicker">Why CH Elevate?</p>
            <h2>We advise. We build. We deliver.</h2>
            <p>Most consultancies tell you what to do. Most coaches inspire you to act. CH Elevate does both, and we stay until the work is done. Our integrated model combines the precision of expert consultancy with sustained coaching, ensuring every recommendation is implemented, every system is adopted, and every team is empowered to keep performing after we leave.</p>
            <p>We bring internationally recognised methodologies to every engagement as tools applied intelligently to your unique environment, not as rigid templates. Our consultants have worked across industries, geographies, and organisational scales, and we understand that context shapes what works.</p>
            <Checklist items={[
              "Globally recognised methodologies: PMBOK, PRINCE2 and Lean Six Sigma",
              "Integrated consultancy and coaching, not one or the other",
              "Four-sector expertise: SME, Corporate, NGO and Government",
              "International reach through onsite, remote and hybrid engagements",
              "Results guaranteed on qualifying Transformation Partnerships",
              "Transparent, structured engagement from day one",
              "No long-term dependency. We build your capability",
            ]} />
          </SplitFeature>
        </div>
      </section>

      <QuoteBand
        title="Outcomes that speak for themselves"
        quote="CH Elevate restructured our entire project delivery function in under four months. We went from consistently missing milestones to completing 92% of our portfolio on time. The team did not just consult. They coached us, trained us, and handed us back a machine that runs itself."
        attribution="Chief Operations Officer, Regional Financial Services Firm"
        stats={[
          { value: "40%", label: "Illustrative average reduction in project cost overruns" },
          { value: "6 months", label: "Target time to full PMO operational maturity under the 100-Day Stand-Up model" },
        ]}
      />

      <CtaBand
        title="Ready to elevate your organisation?"
        body="Every high-performing organisation starts with a single decision: to build better. Book your complimentary 30-minute discovery call and take the first step towards measurable, lasting transformation."
        primary={{ label: "Book a free discovery call", href: "/book" }}
        secondary={{ label: "Explore our services overview", href: "/services" }}
      />
    </ElevatePageShell>
  );
}
