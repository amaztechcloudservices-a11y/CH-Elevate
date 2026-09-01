import type { Metadata } from "next";
import { Building2, Factory, Globe2, Landmark, Sprout } from "lucide-react";

import {
  CtaBand,
  ElevatePageShell,
  IconCards,
  QuoteBand,
  SectionHeading,
  StatsBand,
} from "@/components/elevate-sections";

export const metadata: Metadata = {
  title: "Success Stories",
  description: "Representative CH Elevate transformation stories and outcomes across corporate, public, non-profit, and SME organisations.",
};

const cases = [
  {
    icon: Landmark,
    title: "Government",
    body: "A national agency lacked delivery governance for a major infrastructure programme.",
    bullets: [
      "Solution: 100-Day PMO Stand-Up, PRINCE2-aligned governance, and team training",
      "Outcome: programme delivered on schedule for the first time; internal team equipped to manage future programmes independently",
    ],
    dark: true,
  },
  {
    icon: Sprout,
    title: "NGO",
    body: "A regional non-profit struggled to demonstrate impact to funders and manage multiple grant-funded programmes.",
    bullets: [
      "Solution: efficiency diagnostic, reporting framework, and programme coordinator coaching",
      "Outcome: three funder renewals secured and reporting cycle time reduced by 60%",
    ],
  },
  {
    icon: Building2,
    title: "SME",
    body: "A fast-growing SME was losing revenue to inefficiency as headcount grew ahead of internal systems.",
    bullets: [
      "Solution: value stream mapping, DMAIC sprint, and SOP development",
      "Outcome: operating costs reduced by 28%, onboarding time halved, and gross margin improved by 12 points",
    ],
  },
  {
    icon: Factory,
    title: "Corporate",
    body: "An enterprise delivery team faced a 70% project failure rate linked to poor stakeholder engagement and scope management.",
    bullets: [
      "Solution: process redesign, stakeholder training, and six months of implementation coaching",
      "Outcome: failure rate reduced to 18%, team NPS rose from 22 to 71, and decision speed improved",
    ],
    dark: true,
  },
];

export default function PortfolioPage() {
  return (
    <ElevatePageShell pageSlug="portfolio" className="elevate-stories">
      <section className="elevate-section elevate-stories__intro">
        <div className="ref-container">
          <SectionHeading
            eyebrow="Evidence of what becomes possible"
            title="When expertise meets execution, performance changes."
            intro={<p>These success stories illustrate the kinds of transformation CH Elevate delivers across our four core client segments. Organisational details are anonymised to protect confidentiality.</p>}
            align="center"
          />
        </div>
      </section>

      <StatsBand title="The numbers behind our work" items={[
        { value: "92%", label: "Illustrative on-time delivery outcome in the featured PMO engagement" },
        { value: "35%", label: "Illustrative operational cost reduction benchmark for improvement programmes" },
        { value: "100%", label: "Target: every Transformation Partnership demonstrates measurable capability gains" },
      ]} note="Illustrative figures from the supplied copy blueprint; client verification is required before publication as factual performance data." />

      <section className="elevate-section">
        <div className="ref-container">
          <SectionHeading eyebrow="Featured story" title="Transforming project delivery in financial services" intro={<p><strong>Corporate / Enterprise · PMO Consultancy & Training</strong></p>} />
          <div className="elevate-case-feature">
            <div>
              <span>01</span>
              <h3>The challenge</h3>
              <p>A regional financial services organisation with more than 40 concurrent projects was experiencing consistent delivery failures: projects running 30% to 45% over budget, milestone slippage averaging three months, and no reliable programme visibility for senior leadership. Morale in the delivery function was low, and the Board was questioning whether the organisation could execute its five-year strategy.</p>
            </div>
            <div>
              <span>02</span>
              <h3>The CH Elevate approach</h3>
              <p>Under a full Transformation Partnership, we began with a four-week PMO Maturity Assessment across 12 governance dimensions. Alongside the internal team, we designed a PMBOK-aligned governance framework, configured a portfolio management tool, established reporting rhythms, and delivered a two-day Project Delivery Masterclass for 24 project managers.</p>
            </div>
          </div>
          <div className="elevate-outcomes">
            <article><strong>92%</strong><span>Portfolio delivered on time and on budget within six months</span></article>
            <article><strong>40%</strong><span>Reduction in average cost overrun</span></article>
            <article><strong>24</strong><span>Project managers trained and certified</span></article>
          </div>
        </div>
      </section>

      <QuoteBand
        title="Client perspective"
        quote="Within six months of the CH Elevate engagement, our Board had complete confidence in our delivery capability for the first time in three years. The PMO they helped us build now runs independently, and it runs well."
        attribution="Chief Executive Officer, Regional Financial Services Firm"
      />

      <section className="elevate-section elevate-section--tint">
        <div className="ref-container">
          <SectionHeading eyebrow="More success stories" title="Across every sector we serve" align="center" />
          <IconCards items={cases} columns={2} />
        </div>
      </section>

      <StatsBand
        light
        title="Training & certification outcomes"
        items={[
          { value: "350+", label: "Professionals represented in the programme blueprint" },
          { value: "94%", label: "Illustrative first-time PMP® and PRINCE2 exam pass rate" },
          { value: "4.9/5", label: "Illustrative participant satisfaction rating" },
        ]}
        note="Our training is designed to build practical, applied knowledge and professional confidence, not only exam technique. Participants connect methodology to real workplace situations. Figures remain illustrative until verified."
      />

      <section className="elevate-section elevate-testimonials">
        <div className="ref-container">
          <SectionHeading eyebrow="In their own words" title="What implementation support feels like" align="center" />
          <div className="elevate-testimonials__grid">
            <blockquote>
              “The process improvement engagement delivered results in under four months that we had been attempting to achieve internally for over two years. The DMAIC approach was rigorous, practical, and the coaching support made all the difference.”
              <cite>Operations Director, Manufacturing Enterprise · Illustrative</cite>
            </blockquote>
            <blockquote>
              “As an NGO with limited internal capacity, we needed a partner who understood our constraints. CH Elevate did not just deliver a framework. They trained our team to run it and remained available when we needed support.”
              <cite>Executive Director, International NGO · Illustrative</cite>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="elevate-section elevate-section--navy">
        <div className="ref-container">
          <SectionHeading eyebrow="Our global reach" title="International experience across sectors and geographies" intro={<p>CH Elevate is structured to support organisations across international markets, remotely and on-site. Frameworks and coaching approaches are adapted to varied cultural, regulatory, and operational environments.</p>} align="center" />
          <div className="elevate-region-grid">
            <article><Globe2 aria-hidden="true" /><h3>Americas</h3><p>United States · Caribbean Region · Latin America</p></article>
            <article><Globe2 aria-hidden="true" /><h3>Europe & Africa</h3><p>United Kingdom · Western Europe · Sub-Saharan Africa</p></article>
            <article><Globe2 aria-hidden="true" /><h3>Asia-Pacific & Middle East</h3><p>Southeast Asia · Australia & Pacific · GCC Region</p></article>
          </div>
        </div>
      </section>

      <CtaBand
        title="Ready to write your success story?"
        body="Every transformation begins with a decision to seek the right partner. CH Elevate is ready to help your organisation create outcomes that redefine what is possible for your team, stakeholders, and future."
        primary={{ label: "Book a discovery call", href: "/book" }}
        secondary={{ label: "Contact us", href: "/contact" }}
      />
    </ElevatePageShell>
  );
}
