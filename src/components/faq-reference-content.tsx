"use client";

import { ChevronDown, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const categories = [
  {
    name: "About CH Elevate",
    items: [
      {
        question: "What is CH Elevate Consultancy Limited and what do you do?",
        answer: "CH Elevate Consultancy Limited is an international business consultancy and coaching firm that helps organisations build the systems, skills, and leadership capacity required to deliver consistent, measurable results. Our three core disciplines are PMO Consultancy & Training, Process Efficiency Improvement, and Coaching & Implementation Support. Unlike purely advisory firms, we remain engaged through implementation so recommendations are embedded in operations.",
      },
      {
        question: "Who do you typically work with?",
        answer: "We work with SMEs seeking to scale effectively, corporate and enterprise teams improving delivery performance, non-profits and NGOs building funder-ready operational frameworks, and government and public sector bodies strengthening internal delivery capability. Our international team brings experience across geographies and sectors.",
      },
      {
        question: "What makes CH Elevate different from a traditional consultancy?",
        answer: "Most consultancies diagnose, recommend, and leave. Most coaching firms inspire but do not engage at the systems level. CH Elevate combines expert consultancy, structured coaching, and hands-on implementation through a four-stage model: Diagnose, Build, Embed, Sustain. We stay until results are embedded and your team can sustain them independently.",
      },
    ],
  },
  {
    name: "Our Services",
    items: [
      {
        question: "What is a PMO and does my organisation need one?",
        answer: "A Project Management Office is a central function providing governance, standards, tools, and oversight for project and programme delivery. PMI research indicates that mature PMOs complete 38% more projects on time and within budget. If you run multiple projects, struggle with delivery consistency, or face recurring cost and schedule overruns, a structured PMO is likely to create measurable value.",
      },
      {
        question: "How long does a typical engagement take?",
        answer: "Duration depends on scope, complexity, and service type. A focused Diagnostic typically takes two to four weeks. An Implementation engagement usually runs three to six months. A full Transformation Partnership, covering multiple disciplines with ongoing coaching and embedding, typically runs six to eighteen months. Timelines are agreed in advance around your operational calendar.",
      },
      {
        question: "Do you offer training and certification programmes?",
        answer: "Yes. We offer preparation for PMP® (PMI), PRINCE2 Foundation and Practitioner, and Agile/Scrum certifications, plus our Project Delivery Masterclass combining project management, process improvement, and leadership fundamentals. Delivery can be onsite, remote, or blended, with group and organisational bookings available.",
      },
    ],
  },
  {
    name: "Working With CH Elevate",
    items: [
      {
        question: "How do we get started with CH Elevate?",
        answer: "Every engagement begins with a complimentary 30-minute Discovery Call with a senior consultant. We learn your context, challenges, and objectives with no obligation or sales pressure. We then provide a transparent proposal covering scope, approach, timeline, and investment. Once terms are agreed, the engagement begins.",
      },
      {
        question: "Do you work onsite, remotely, or a combination of both?",
        answer: "All three. Many engagements blend remote diagnostic and planning phases with onsite working sessions during critical implementation. For international clients, we manage high-impact engagements across time zones and geographical boundaries. Delivery format is agreed in advance based on what will create the best outcome.",
      },
      {
        question: "What results can we expect and how are they measured?",
        answer: "We define measurable success criteria before work begins and track them through structured check-ins. Outcomes may include reduced project cost overruns, improved on-time delivery, shorter process cycle times, stronger team capability, or leadership effectiveness gains. Our focus is tangible, quantified value rather than activity alone.",
      },
    ],
  },
  {
    name: "Investment & Commitment",
    items: [
      {
        question: "How is CH Elevate's pricing structured?",
        answer: "Pricing is engagement-specific and agreed transparently in advance. Diagnostic engagements are typically fixed-price. Implementation and Transformation work may use monthly retainers, project-based fees, or a combination. Day-rate options are available for focused specialist input. Investment discussions begin with the complimentary Discovery Call.",
      },
      {
        question: "Do you offer any form of guarantee?",
        answer: "For qualifying Transformation Partnerships, provided both parties complete the agreed programme and implement all actions in good faith, we commit to continuing support until the agreed outcomes are achieved. Final guarantee terms are documented in the engagement agreement.",
      },
      {
        question: "Can CH Elevate support organisations in different countries?",
        answer: "Yes. CH Elevate is structured as an international consultancy. We work in English and adapt frameworks to local regulatory, cultural, and operational contexts. We support fully remote delivery and in-country visits, ensuring the approach remains relevant to each market.",
      },
    ],
  },
];

export function FaqReferenceContent() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return categories;
    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter(({ question, answer }) =>
          `${question} ${answer}`.toLowerCase().includes(normalized),
        ),
      }))
      .filter((category) => category.items.length);
  }, [query]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="faq-ref__faq-inner ref-container">
      <h2>What can we help you with today?</h2>
      <form className="faq-ref__search" role="search" onSubmit={handleSearch}>
        <label className="sr-only" htmlFor="faq-search">Search frequently asked questions</label>
        <input id="faq-search" type="search" placeholder="Search questions and answers…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" aria-label="Search"><Search aria-hidden="true" /></button>
      </form>
      {filtered.length ? (
        <div className="elevate-faq-categories">
          {filtered.map((category) => (
            <section key={category.name}>
              <h3>{category.name}</h3>
              <div className="elevate-faq-list">
                {category.items.map(({ question, answer }, index) => (
                  <details className="faq-ref__item" key={question} open={!query && index === 0}>
                    <summary><span>{question}</span><ChevronDown aria-hidden="true" /></summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="faq-ref__empty">No questions match “{query}”. Try a broader search or contact our team.</p>
      )}
    </div>
  );
}
