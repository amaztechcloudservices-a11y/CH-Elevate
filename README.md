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

Install Node.js 22 or newer, pnpm 10, and PostgreSQL 16 or newer. Configure
PostgreSQL to listen only on loopback; the example environment expects port
`55434`.

```powershell
Copy-Item .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm courses:seed
pnpm dev
```

Review generated authentication migrations before applying them. Add the first
client administrator through an auditable provisioning command, not through a
public role selector.

### Windows local preview

Register startup once using
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-local-startup.ps1`.

On the configured workstation, run `pnpm local:start` to ensure the hidden
`CH Elevate Local Server` Windows task is running and wait for the homepage to
respond, then open `http://localhost:3001/` in Codex. Repeated launches reuse the
same server. The task starts at Windows sign-in and restarts Next.js if it exits.
Logs are stored in `D:\CodexData\tmp\ch-elevate-local`.

For a foreground development session on another machine, use `pnpm dev:local`.
Both launch methods bind to `127.0.0.1:3001`. The production standalone build
configuration is separate from this local development server.

To disable automatic startup on this workstation, run
`Disable-ScheduledTask -TaskName 'CH Elevate Local Server'`. To remove its
registration, run `Unregister-ScheduledTask -TaskName 'CH Elevate Local Server'`.
Disabling startup does not stop an already running server.

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

Production runs directly on the Hostinger VPS with native PostgreSQL 16,
systemd-managed Node.js services, and Nginx. The database and application port
listen on loopback only. Deployment definitions and the rollback procedure are
documented in `deploy/README.md`.
