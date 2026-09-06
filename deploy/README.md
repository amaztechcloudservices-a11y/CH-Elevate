# Native Hostinger VPS deployment

CH Elevate runs without project containers. The production stack is:

- Node.js 22 and pnpm 10
- PostgreSQL 16 bound to loopback
- `ch-elevate.service` for the Next.js standalone server
- `ch-elevate-mail-worker.service` for queued operational mail
- Nginx for HTTP, HTTPS, and reverse proxying
- Certbot for certificate renewal

Production secrets live in `/etc/ch-elevate/ch-elevate.env` with mode `0600`.
Course files live in `/var/lib/ch-elevate/course-portal`. Neither location is
inside the Git checkout.

## Release procedure

1. Create a PostgreSQL custom-format dump and archive the course storage.
2. Fast-forward `/opt/ch-elevate/source` to the reviewed Git revision.
3. Run `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build`.
4. Copy `public` and `.next/static` into `.next/standalone`.
5. Install the checked-in systemd and Nginx definitions and validate them.
6. Restart both systemd services, reload Nginx, and verify `/api/ready`.

Do not replace the environment file, database, certificate, or course storage
during a routine release.

## Rollback

Keep the pre-release source archive, database dump, course-storage archive, and
environment backup together under `/opt/ch-elevate/backups`. Restore the source
revision and database dump, then restart both systemd services. Validate the
loopback health endpoint before reloading Nginx.
