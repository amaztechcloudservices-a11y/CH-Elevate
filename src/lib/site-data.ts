export const services = [
  {
    slug: "business-strategy",
    title: "Business strategy",
    description: "Define where to play, how to win, and what to do next.",
    detail:
      "A practical strategy engagement aligns leadership around priorities, choices, measures, and an executable roadmap.",
  },
  {
    slug: "financial-planning",
    title: "Financial planning",
    description: "Model the future, align resources, and strengthen performance.",
    detail:
      "Turn assumptions into useful forecasts, scenarios, budgets, and decision-ready management information.",
  },
  {
    slug: "operational-improvement",
    title: "Operational improvement",
    description: "Streamline operations and build systems that scale.",
    detail:
      "Map critical work, remove friction, clarify accountability, and create repeatable operating disciplines.",
  },
  {
    slug: "risk-and-compliance",
    title: "Risk and compliance",
    description: "Manage risk proactively and meet regulatory expectations.",
    detail:
      "Build proportionate controls, reporting, ownership, and review routines around the risks that matter most.",
  },
  {
    slug: "project-advisory",
    title: "Project advisory",
    description: "Plan with clarity, execute with discipline, and deliver results.",
    detail:
      "Establish governance, milestones, reporting, risk controls, and decision paths for important initiatives.",
  },
  {
    slug: "audit-and-evaluation",
    title: "Audit and evaluation",
    description: "Turn evidence into a clear view of performance and priorities.",
    detail:
      "Review programmes, controls, evidence, and outcomes to identify gaps, practical improvements, and accountable next actions.",
  },
  {
    slug: "growth-planning",
    title: "Growth planning",
    description: "Identify opportunities and build a roadmap to grow.",
    detail:
      "Evaluate markets, customer needs, capabilities, economics, and delivery requirements before committing resources.",
  },
] as const;

export const projects = [
  {
    slug: "growth-roadmap",
    title: "Turning a complex growth plan into a clear operating roadmap",
    category: "Strategy",
    image: "/images/business-meeting-1.jpg",
    summary:
      "Leadership priorities, a simplified operating model, and a phased execution roadmap.",
  },
  {
    slug: "financial-forecast",
    title: "Building a financial forecast leaders could use",
    category: "Financial planning",
    image: "/images/people-working-on-business-charts.jpg",
    summary:
      "A practical scenario model connected investment decisions to cash, capacity, and risk.",
  },
  {
    slug: "operational-reset",
    title: "Resetting operational rhythms for a growing team",
    category: "Operations",
    image:
      "/images/businesswoman-on-business-meeting-talking-with-colleagues-standing-in-office.jpg",
    summary:
      "Clear ownership, simpler handoffs, and a management cadence built for sustainable growth.",
  },
  {
    slug: "risk-programme",
    title: "Making risk ownership practical across the business",
    category: "Risk and compliance",
    image: "/images/it-consultant-at-business-meeting.jpg",
    summary:
      "A focused risk programme with proportionate controls and decision-ready reporting.",
  },
  {
    slug: "project-recovery",
    title: "Bringing a critical transformation programme back on track",
    category: "Project advisory",
    image:
      "/images/three-young-business-professionals-standing-together-and-discussing-over-business-report.jpg",
    summary:
      "Rebased priorities, visible milestones, stronger governance, and faster issue resolution.",
  },
  {
    slug: "market-expansion",
    title: "Evaluating the next market before committing capital",
    category: "Growth planning",
    image: "/images/diverse-business-shoot.jpg",
    summary:
      "A disciplined opportunity assessment covering customer demand, economics, capability, and execution risk.",
  },
] as const;

export const posts = [
  {
    slug: "strategy-your-team-can-execute",
    title: "Building a strategy your team can actually execute",
    category: "Strategy",
    date: "May 14, 2026",
    image: "/images/business-meeting.jpg",
    excerpt:
      "The strongest strategy is specific enough to guide trade-offs and practical enough to change weekly decisions.",
  },
  {
    slug: "practical-financial-forecast",
    title: "What a practical financial forecast should answer",
    category: "Financial planning",
    date: "May 2, 2026",
    image: "/images/people-working-on-business-charts.jpg",
    excerpt:
      "A useful forecast connects assumptions, cash, capacity, risk, and the decisions leadership can still influence.",
  },
  {
    slug: "operational-complexity",
    title: "When operational complexity starts slowing growth",
    category: "Operations",
    date: "April 22, 2026",
    image: "/images/low-angle-view-of-pipelines-at-industry.jpg",
    excerpt:
      "Complexity becomes expensive when ownership, handoffs, and management information no longer support the work.",
  },
] as const;

export const team = [
  ["Louis Kennedy", "Managing Consultant", "pro__0008_img_1.jpg"],
  ["Brandon Baxter", "Strategy Lead", "pro__0004_Layer-2.jpg"],
  ["Layla Turner", "Financial Advisory", "pro__0007_img_2.jpg"],
  ["Salma Martin", "Operations Lead", "pro__0001_Layer-5.jpg"],
  ["Anna Jenkins", "Project Advisory", "pro__0003_Layer-3.jpg"],
  ["Emanuel Merrill", "Growth Consultant", "pro__0005_Layer-1.jpg"],
  ["Madison Atkinson", "Risk Consultant", "pro__0002_Layer-4.jpg"],
  ["Georgina Hawkins", "Business Analyst", "pro__0000_Layer-6.jpg"],
] as const;

export const faqs = [
  [
    "What happens during the initial consultation?",
    "We clarify the decision or challenge, understand the context, and determine whether a focused engagement would be useful.",
  ],
  [
    "Do you work with small and growing businesses?",
    "Yes. The scope is shaped around the decision, resources, and implementation capacity of the organisation.",
  ],
  [
    "Can you work alongside our existing advisers?",
    "Yes. Engagements can complement legal, accounting, technology, operational, and specialist advisers.",
  ],
  [
    "How long does a typical engagement take?",
    "Focused assignments may take several weeks, while implementation and transformation work can run across multiple phases.",
  ],
  [
    "Do you provide implementation support?",
    "Yes. Recommendations can be translated into plans, governance, operating routines, and hands-on delivery support.",
  ],
] as const;
