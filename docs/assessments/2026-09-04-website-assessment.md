# CH Elevate website and backend assessment

Assessment date: 4 September 2026  
Application: `D:\CLARHEN CONSULTING\Website`  
Surfaces: local application on port 3001; read-only public production checks at https://ch-elevateconsultancy.com

## Executive conclusion

The application has a credible operational foundation: server-side administrator checks, booking collision protection, course-capacity controls, private learning-material delivery, and a comparatively mature booking-email history. A wholesale rebuild is not warranted.

However, I would not yet describe the complete operation as fully verified or ready for unattended use. The most important issues are misleading website-form settings, course financial reporting, inconsistent notification reliability, and incomplete operational diagnostics. The public APIs also currently expose no bookable events or available course offerings. That may be intentional configuration, but it prevents visitors completing those conversion paths today.

The design needs a focused administrative and forms refresh, not a new brand. Preserve the bundled Sora/Manrope/monospaced typography and existing colour identity; improve field sizing, information hierarchy, long-form navigation, validation, and recovery.

This document began as a read-only assessment. The implementation appendix records the corrective work subsequently completed and the remaining operational acceptance gates.

## Evidence and scope

| Area | What was examined | Important boundary |
|---|---|---|
| Public website | Home, booking, programmes, contact, account registration/login; contact interaction; response headers | Not a page-by-page accessibility or SEO certification |
| Booking administration | Event editor, availability/questionnaires, calendar and email settings; relevant APIs and scheduling/mail source | Editing and mail actions tested with simulated records, not live sends |
| Course administration | Registrations, catalogue/offering editor, materials, reports and analytics UI; payment, approval, capacity, portal and download source | Local operational lists were empty; real populated workflows not completed |
| Student access | Authentication/profile checks, invitation acceptance, material/invoice/certificate access logic | No two-account live access-isolation test or real invitation acceptance |
| Website/System settings | Global details, Forms editor, CMS publication, workspace structure, auth and health configuration | No infrastructure configuration changes or backup restoration |

### Verification results

- **89 unit tests passed across 23 files.** Database integration tests were deliberately excluded to avoid altering operational data.
- **37 Playwright tests passed**, covering workspace access/navigation, booking calendars, event/questionnaire editors, booking email controls, and course catalogue/application dialogs. Responsive coverage includes widths from 320 to 1440 pixels. Mutating operations in these tests were mocked.
- TypeScript/ESLint check: **zero errors; 12 existing warnings**, principally Next.js internal-navigation guidance.
- Production dependency audit: **no known vulnerabilities reported**. This is not proof of absence of security flaws.
- Fourteen GET-capable administrator APIs rejected anonymous access with **401 on both local and production**. Seven other endpoints returned **405 for GET**; those responses do not establish authorization correctness for their supported methods.
- Six checked public routes returned **200** on both environments. The anonymous student-portal API returned **401**.
- Both environments returned empty public booking-event and course-offering lists. The local booking page displayed the corresponding unavailable state.
- The public production homepage response lacked CSP, frame protection, `nosniff`, HSTS, Referrer-Policy and Permissions-Policy headers in the response checked.

“Confirmed” below means demonstrated by runtime behavior or directly supported by the inspected implementation. Code-derived risks are distinguished from exercised failures.

## Priority findings

### P1 — Resolve before relying on the operation at scale

#### 1. Website form settings are not authoritative

**Confirmed implementation mismatch.** Website Management promises control over labels, required fields, options, success messages and whether forms accept submissions. The contact component and contact API use their own hardcoded definitions. The newsletter implementation uses only part of its CMS definition, while its API does not enforce the CMS active flag.

**Impact:** An administrator can believe a form is disabled or updated while visitors still receive the old behavior and the server still accepts submissions.

**Recommendation:** Apply one validated form definition to both rendering and server enforcement. Until that is implemented, hide or accurately label unsupported settings. Keep booking event questionnaires separate from the general website Forms editor.

**Acceptance:** Disable each form in a staging environment and verify both the visible form and a direct POST reject submissions. Changes to supported labels, options, required fields and success messages must agree end to end.

Evidence: [Forms editor](<D:/CLARHEN CONSULTING/Website/src/components/admin-cms-app.tsx:374>), [contact component](<D:/CLARHEN CONSULTING/Website/src/components/contact-reference-form.tsx:14>), [contact API](<D:/CLARHEN CONSULTING/Website/src/app/api/contact/route.ts:7>), [subscription API](<D:/CLARHEN CONSULTING/Website/src/app/api/subscriptions/route.ts:13>).

#### 2. Course outstanding balances are not reliable financial balances

**Confirmed in code; not observed with real payments.** The dashboard adds registration amounts without separating currencies and formats the result as JMD. Partially paid registrations retain the full amount in that total. The payment mutation records the registration's entire amount when changing status; it has no input for the amount actually received.

**Impact:** A status tracker can be mistaken for accurate receivables. For example, mixing JMD 100 and USD 100 would produce a raw total displayed as JMD 200, not a meaningful financial result.

**Recommendation:** Separate amounts by currency; snapshot currency with financial records; record actual receipts/refunds and calculate remaining balances. Define treatment of rejected/cancelled applications. Keep offline payment handling—this does not require an online payment gateway. The offering editor should expose currency instead of silently forcing JMD when catalogue courses support multiple currencies.

**Acceptance:** Fixtures covering JMD/USD, partial receipts, refunds, waivers and cancellations reconcile to an independently calculated ledger. Label the existing metric as provisional until corrected.

Evidence: [aggregation](<D:/CLARHEN CONSULTING/Website/src/app/api/admin/courses/route.ts:55>), [payment records](<D:/CLARHEN CONSULTING/Website/src/app/api/admin/courses/route.ts:150>), [dashboard and offering form](<D:/CLARHEN CONSULTING/Website/src/components/course-admin-panel.tsx:86>).

#### 3. Contact and newsletter endpoints need equivalent abuse controls

**Confirmed code gap.** These handlers parse request JSON directly without the bounded-body and submission-rate-limit controls already used elsewhere. Contact submissions additionally trigger inbox mail. Malformed JSON is not handled with a deliberate validation response in these handlers.

**Impact:** Avoidable spam, database/inbox load and poor failure responses. No abuse or load attack was attempted.

**Recommendation:** Reuse existing bounded JSON and public-submission limiting helpers; return consistent safe errors; normalize newsletter email addresses; add a proportionate bot-control strategy and accurate consent evidence.

**Acceptance:** Oversized, malformed and repeated submissions are rejected safely in staging without duplicate mail or unnecessary database writes.

Evidence: contact and subscription APIs linked above.

#### 4. Public booking and course entry points currently have no inventory

**Confirmed runtime state:** `/api/bookings/events` and `/api/courses` returned empty data on both local and production. This does not establish that the production database contains no drafts or expired offerings.

**Recommendation:** Before promoting registration or booking, configure and approve at least one real published event and one eligible course offering, including availability, capacity, price/currency, registration windows and notification settings. If the empty state is intentional, show a prominent working contact or interest-list action, rather than only explanatory text.

**Acceptance:** A controlled staging booking/application can be completed against representative published inventory; production inventory is then verified without creating unsolicited records.

### P2 — Reliability, security hardening and administrative control

#### 5. Contact enquiry selection erases the visitor's draft

**Reproduced without submitting:** entering a name and changing the enquiry category cleared the name field. The selected subject is used as a React key, remounting the entire form.

**Recommendation:** Preserve form state and update only the subject field. Add a regression test that enters all fields, switches category and confirms the draft survives.

Evidence: [contact enquiry wrapper](<D:/CLARHEN CONSULTING/Website/src/components/contact-enquiry-form.tsx:55>).

#### 6. A stale CMS editor can overwrite another administrator's changes

**Code-derived concurrency risk.** Publication sends and writes the full CMS snapshot. The database lock serializes writes but does not compare the submitted revision with the currently stored revision.

**Recommendation:** Use section-level patches and optimistic revision checks, with a clear conflict response. Provide preview, publication history and rollback. Preserve the existing validation and audit logging.

**Acceptance:** Two editors starting at the same revision cannot silently overwrite one another.

Evidence: [CMS save](<D:/CLARHEN CONSULTING/Website/src/server/website-cms.ts:20>).

#### 7. Course notifications lag behind booking email reliability

**Confirmed implementation difference.** Booking mail has persistent delivery-attempt states and retry controls. Course/site mail generally sends within the request, returning a boolean; some callers warn on failure, while cancellation and some other notification paths ignore the result. “Delivered” in that helper means the SMTP send completed, not confirmed inbox delivery. No separately running automatic retry worker was identified for the inspected booking outbox paths.

**Recommendation:** Extend the durable outbox pattern to course and contact notifications, with explicit connection/send limits, a background retry worker, backoff, attempt history, stale-message protection and failure alerts. Keep business changes saved even when email fails and say so clearly. Distinguish queued, provider accepted, failed and uncertain outcomes.

**Acceptance:** A simulated SMTP outage and process restart preserve the operation and pending message; recovery sends only the current notification, with duplicate-risk handling. Actual delivery to a controlled mailbox remains a separate test.

Evidence: [site mail helper](<D:/CLARHEN CONSULTING/Website/src/server/site-mail.ts:31>), [course cancellation](<D:/CLARHEN CONSULTING/Website/src/app/api/admin/courses/route.ts:147>), [booking mail](<D:/CLARHEN CONSULTING/Website/src/server/booking-mail.ts>).

#### 8. System settings are fragmented rather than a complete operations console

The application exposes Booking, Course Registration and Website Management workspaces. There is no comparable central System Settings workspace. Business details, event scheduling, email settings and deployment configuration have different owners. Active `client_admin` users share broad access; no granular administrative permissions or MFA configuration was found in the inspected auth setup.

**Recommendation:** Add a small, role-protected System Settings area with the following ownership boundaries:

| Section | Responsibility |
|---|---|
| Business defaults | Canonical contact details, office hours/timezone, default currency and locale |
| Staff and access | Named staff accounts, workspace permissions, MFA and session revocation |
| Notifications | Verified senders, recipient routing, template ownership, queue/failure status |
| Service health | Database, storage and email configuration status; no secret values displayed |
| Audit and retention | Searchable administrative activity and approved retention policies |
| Recovery | Last successful backup, restore-test evidence, deployment/build version |

Keep event-specific availability in Booking and offering-specific capacity/prices in Courses. Keep SMTP credentials and application secrets server-side, not in generic editable CMS JSON. Introduce permissions according to actual staffing needs rather than unnecessary complexity. MFA for administrator accounts follows [OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Evidence: [workspaces](<D:/CLARHEN CONSULTING/Website/src/lib/admin-workspaces.ts:3>), [admin authorization](<D:/CLARHEN CONSULTING/Website/src/server/admin-auth.ts>), [authentication configuration](<D:/CLARHEN CONSULTING/Website/src/server/auth.ts>).

#### 9. Operational health and response hardening are incomplete

The health route always returns `ok: true`; it does not establish database or private-storage readiness. The production homepage response checked did not include the six security headers noted above.

**Recommendation:** Separate process liveness from bounded dependency-readiness checks. Add alerts for failures and notification backlog. Introduce a tested CSP in report-only mode first, account for map and other legitimate dependencies, then enforce it. Add suitable frame, content-type, referrer and permissions protections. Configure HSTS only after confirming the intended HTTPS/domain coverage. These are hardening recommendations, not evidence of an intrusion. See [OWASP's HTTP header guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

Evidence: [health endpoint](<D:/CLARHEN CONSULTING/Website/src/app/api/health/route.ts:3>), deployment healthcheck configuration, current HTTP responses.

#### 10. Main administrative data views will become difficult to operate as records grow

The initial course-admin response loads all courses, offerings, registration rows and materials. The main registration view lacks equivalent server-side pagination/search. Website inbox retrieval is capped at the latest 250 without a paginated route to older submissions. Booking lists already provide useful pagination patterns.

**Recommendation:** Fetch data by active tab; add paginated search/filter endpoints, database-derived aggregates, loading/error/retry states and explicit export behavior. Provide queue filters for pending approvals, unpaid balances, upcoming sessions and certificate actions.

Evidence: [course GET handler](<D:/CLARHEN CONSULTING/Website/src/app/api/admin/courses/route.ts:46>), [website submissions API](<D:/CLARHEN CONSULTING/Website/src/app/api/admin/submissions/route.ts:26>).

#### 11. Validation and recovery behavior are inconsistent across forms

Course administration renders all message strings with success styling, including failure messages. Some account forms lack a complete pending/exception-handling path. The public course application receives structured validation issues but does not consistently use them for field-specific recovery. The course-dialog unsaved-change guard is a good existing pattern to reuse; do not remove it.

**Recommendation:** Share field, error-summary and submission-state components. Use distinct success/error/warning styling, preserve data on failure, focus the first invalid field and connect messages with `aria-describedby`. Disable repeat submission while pending, but always restore the control on failure. Announce outcomes accessibly. This follows [W3C form-notification guidance](https://www.w3.org/WAI/tutorials/forms/notifications/).

Evidence: [course notice](<D:/CLARHEN CONSULTING/Website/src/components/course-admin-panel.tsx:83>), [account forms](<D:/CLARHEN CONSULTING/Website/src/components/portal-auth-forms.tsx>), [course application](<D:/CLARHEN CONSULTING/Website/src/components/course-registration.tsx>).

## Form and interface design recommendations

| Screen/form | Assessment | Recommended design update |
|---|---|---|
| Booking event editor | Uneven field geometry; Agent name measured about 116px high versus about 46px for Event title. Long schedule/questionnaire editor. | Fix grid stretching; standardize ordinary control heights around 44–48px. Group Event details, Host, Availability, Questions and Review. Keep save/cancel accessible and add unsaved-change protection. |
| Availability and exceptions | Powerful controls, but raw timezone text and lengthy technical explanations increase effort. | Searchable timezone selection, weekly schedule preview, clearly labeled date exceptions and a preview of the next available slots. Preserve correct timezone conversion logic. |
| Booking calendar | Responsive tests passed; desktop operational view is a useful foundation. | Maintain obvious date/timezone context, keyboard navigation and concise reschedule/status dialogs. Make notification effects clear before saving. |
| Booking email settings | Better operational visibility than the other mail flows, but technical tokens and long text editors dominate. | Group sender setup separately from templates and delivery history. Add token insertion help, compact preview and persistent unsaved/save feedback. Keep test sends explicitly intentional. |
| Public booking form | Actual empty-inventory state prevents a full real event walkthrough; questionnaire UI has mocked coverage. | Show selected event, duration and timezone throughout; use a clear details → slot → attendee → confirmation sequence where needed, with actionable empty states. |
| Course catalogue editor | Functional responsive dialog with existing close protection; long mobile scrolling and explanatory copy. | Divide Identity, Content, Pricing/access and Publication. Collapse advanced explanations; provide a review summary. Consider a dedicated editor page if field count continues growing. |
| Schedule offering | Important dates, fee and registration windows are densely grouped; currency silently fixed to JMD. | Show timezone explicitly for every date group, expose currency, inherit sensible defaults and preview fee/capacity/window before publication. Distinguish course definition from its scheduled offering. |
| Public course application | Individual and organisation workflows require substantial entry. | Clearly choose application type; provide an “I am attending” shortcut, participant count/limit, fee/currency summary and retained data. Explain approval and offline payment next steps before submission. |
| Registration administration | Support-email/password-recovery panels compete with the queue; many operations share a dense page. | Lead with approvals and participant search. Move support tools into contextual actions. Use a registration detail drawer with separate status, payment, attendance, documents and certificate groups. |
| Materials upload | Useful scope explanation and private-file controls already exist. | Preview exactly who can access the file and the effect of uploading a replacement version. Show progress, format/size limits and recoverable errors. |
| Roster import / invoices / reports | Operational utilities benefit from more deliberate staging and review. | Preview parsed roster rows and per-row errors before import; preview document recipient/reference/amount before attachment; make selected-record export scope explicit. Validate these with staging records. |
| Student signup/login/reset | Clean branded starting point; recovery and field guidance need consistency. | Add show-password controls, clear requirements and pending/error states, purpose/privacy copy, and a distinction between creating an account and applying for a course. |
| Contact form | Confirmed draft reset; static form definition diverges from CMS controls. | Preserve entered data, wire authoritative settings, provide field-level errors and accurate privacy/consent language. |
| Newsletter | Compact, but CMS controls and backend behavior diverge. | Wire active state and messages; explain subscription purpose and provide a verified opt-out lifecycle before campaign use. |
| Administrative shell | Marketing navigation/footer and a sparse sidebar consume useful workspace. | Use compact application chrome, a meaningful task-oriented sidebar, a mobile drawer and a persistent workspace switcher. Retain brand typography and colours. |

The responsive tests passed; these recommendations are about efficiency and consistency, not a claim that every screen currently overflows. Complete keyboard, screen-reader, focus, contrast and zoom testing remains necessary before asserting accessibility compliance.

## Additional content and configuration cleanup

- Global contact details are not universally consumed: the Contact page priority block hardcodes email/phone. Centralize shared values without conflating public contact email with authenticated SMTP sender configuration.
- Office-hours copy says GMT while booking and course interfaces use Jamaica time. Confirm the intended business hours and display their timezone consistently.
- Social links currently lead to generic social-network homepages. Replace them with verified company profiles, or omit inactive channels.
- Some forms submit `consent: true` without a corresponding explicit choice shown. Review the purpose and wording, and record the user's actual action rather than treating a hardcoded boolean as evidence of consent. This is a product/data-handling recommendation, not a legal compliance opinion.
- Course analytics already distinguishes applications from participant records, describes date semantics, separates payment-status counts from revenue, and offers exact-value tables. Preserve that clarity while fixing the separate financial dashboard metric.
- Confirm the intended role of Modules & lessons. The earlier registration-focused scope emphasized approvals, private resources, offline payments, attendance and certificates; do not expand into a full LMS without a deliberate product decision.

## What is working well

- Active administrator role checks and protected server endpoints, not only hidden navigation.
- Transaction-level booking collision and course-capacity controls.
- Version/conflict protection in parts of the catalogue and booking editors.
- Private material storage, scoped downloads, file-type/signature checks, size limits, and archived-version handling.
- Student/coordinator distinctions and personal certificate/material checks in the inspected portal/download code.
- Persistent booking-email attempts, retry safeguards and superseded-message handling.
- Audit entries on meaningful operations and protected downloads.
- Locally bundled brand fonts and broad responsive regression coverage.

## Recommended implementation order

1. **Correctness and visitor completion:** wire form settings; fix draft loss; harden public submissions; correct financial semantics/currency; confirm public inventory.
2. **Operational reliability:** durable course/site mail and workers; CMS conflict handling; dependency readiness and alerts; response-header hardening; staff access/MFA design.
3. **Focused design refresh:** shared field/error states; dedicated admin shell; reorganized booking/course editors; better registration queues and contextual support tools.
4. **Operational acceptance in isolated staging:** representative data, real controlled mailboxes, multiple identities, failure injection, backup restoration and accessibility testing.

Do not deploy an unrelated visual overhaul together with payment/access changes. Keep migrations, financial corrections and design work separately reviewable and reversible.

## Required staging acceptance before a full readiness sign-off

- Booking create → approve/change → reschedule → cancel, including simultaneous attempts for the same slot, stale editor conflicts and timezone boundaries.
- Individual and organisation applications → capacity/waitlist → approval/rejection → invitation acceptance; coordinator participant additions/substitutions and cutoff enforcement.
- Partial/full offline payment and refund reconciliation in at least two currencies; invoice/receipt download visibility for participants versus organisation coordinators.
- Materials access with two unrelated students and a coordinator; private-recipient material isolation, archived versions and inactive accounts.
- Attendance → certificate issue → correction/revocation → authenticated download and verification behavior.
- Password reset, expiry, single-use invitation behavior and session revocation using controlled identities.
- SMTP unavailable/slow, database unavailable, worker restart and duplicate-request scenarios.
- A real backup restoration into an isolated environment, including private uploaded documents, not just the database.
- Populated-list performance; keyboard/screen-reader flows; desktop/mobile zoom, contrast and field-error recovery.

These checks were not performed against live operational data during this read-only assessment. Accordingly, test success here should not be read as a complete production lifecycle, penetration-test or disaster-recovery certification.

## Implementation appendix — 5 September 2026

The highest-risk code recommendations have now been implemented in independently reviewable commits:

- Public contact and newsletter settings are authoritative end to end, explicit consent is recorded, drafts survive subject changes, request bodies are bounded, and database-backed rate limits protect both endpoints.
- Course financial records now retain currency and actual transaction amounts. Partial payments, receipts, refunds, outstanding balances, cancellations, rejections, waivers, and multi-currency totals no longer share the previous misleading semantics.
- Website publishing uses revision preconditions and rejects stale editors without discarding their drafts.
- A protected System Settings workspace reports database, private storage, email queues, administrator/session posture, build version, audit activity, and backup/restore timestamps. `/api/ready` now checks critical dependencies while `/api/health` remains a liveness check.
- Response hardening now includes a report-only Content Security Policy, clickjacking and MIME protections, referrer and browser-permission policies, and production HSTS.
- Public course applications now make individual/team registration, participant count, capacity, fee/currency, offline-payment expectations, and the “I am attending” path explicit.
- Course-admin notices distinguish success, warning, and failure. Student access recovery is contextual rather than competing with the registration queue, and account forms now have pending/error recovery and password visibility controls.
- Course and website mail is stored durably before delivery, retried with exponential backoff, and distinguishes failed from uncertain delivery so an operator must explicitly confirm potentially duplicative retries. A dedicated worker and manual System Settings retry controls were added.

Validation after the changes:

- Database migrations `0014`, `0015`, and `0016` applied successfully to the isolated local fixture database.
- Unit/integration suite: 93 passed and 90 deliberately skipped by environment gating.
- Full Playwright suite: 117 passed and 23 deliberately skipped; responsive and real authenticated booking/course paths were included.
- Production build completed successfully and the type/lint check had zero errors (nine existing internal-navigation warnings remain).

The following recommendations require business data, identity policy, or controlled infrastructure exercises and therefore remain acceptance gates rather than inferred changes:

- Publish approved booking events and course offerings; no inventory was invented.
- Supply verified company social-profile URLs or decide which inactive channels to remove.
- Define the staff permission matrix and MFA/identity-provider policy before changing administrator authorization.
- Exercise real mailbox delivery/failure scenarios, backup restoration, and multi-user accessibility testing in isolated staging.
- Review CSP reports before changing the policy from report-only to enforcement.
- Complete deeper editor pagination/search and the optional long-form booking/course workflow redesign if operational volume demonstrates the need.
