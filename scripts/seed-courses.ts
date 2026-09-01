import { courses } from "../src/db/schema";
import { getDb } from "../src/server/db";

const seed = [
  { slug: "project-management-masterclass", title: "Project Management MasterClass", summary: "A practical 12-week programme covering project delivery, stakeholders, risk, finance, and communication.", description: "Blended group learning covering the PMBOK framework, stakeholder management, project risk, financial management, and communication. Includes a 35-hour contact certificate suitable for PMP eligibility." },
  { slug: "process-improvement-masterclass", title: "Process Improvement MasterClass", summary: "A 12-week DMAIC-based programme built around a live process improvement project.", description: "Covers process mapping, measurement, root-cause analysis, solution design, implementation, and control through structured practical application." },
  { slug: "leadership-change-masterclass", title: "Leadership & Change MasterClass", summary: "A 12-week applied programme for emerging and experienced leaders managing change.", description: "Combines leadership theory, coaching skills, Prosci ADKAR change fundamentals, and practical workplace application." },
];

async function main() {
  for (const course of seed) await getDb().insert(courses).values(course).onConflictDoUpdate({ target: courses.slug, set: { ...course, updatedAt: new Date() } });
  process.stdout.write(`Seeded ${seed.length} CH Elevate courses.\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : error}\n`); process.exitCode = 1; });
