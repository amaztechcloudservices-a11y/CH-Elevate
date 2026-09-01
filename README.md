# Premium Full-stack Starter

Next.js starter for client products that need accounts, a controlled
administration area, staff roles, customer profiles, booking, or business
workflows.

## Included

- Next.js App Router with standalone Node output
- Strict TypeScript and Tailwind CSS v4
- shadcn/ui using Base UI primitives
- Locally bundled Sora, Manrope, and JetBrains Mono variable fonts
- PostgreSQL and Drizzle ORM
- Better Auth in the same application and database
- Contact, subscription, profile, appointment, and audit-log schema
- Course registration, organisation rosters, private materials, offline payment
  documents, attendance, certificates, and participant/coordinator portals
- SMTP mail, background-job package, Zod, Vitest, and Playwright
- Motion for React interface transitions; add GSAP timelines for narrative
  motion

## Local setup

```powershell
Copy-Item .env.example .env.local
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm courses:seed
pnpm dev
```

Review generated authentication migrations before applying them. Add the first
client administrator through an auditable provisioning command, not through a
public role selector.

## Commands

```powershell
pnpm check
pnpm test
pnpm build
```

Database-backed course end-to-end tests require a loopback PostgreSQL database
on port `55434`, the migrations applied, an SMTP capture service on port `1026`,
and the application running at `http://localhost:3000`:

```powershell
$env:COURSE_E2E = "1"
pnpm test:e2e
```

`COURSE_STORAGE_DIR` must resolve to a private persistent directory outside the
public web root. Include that directory in Hostinger backups. For standalone
deployment, copy `public` and `.next/static` into `.next/standalone` before
starting `.next/standalone/server.js`.

Production uses the PostgreSQL service on the same Hostinger VPS/private
network as the application. Never expose the database port publicly.
