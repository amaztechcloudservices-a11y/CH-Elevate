import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const enabled = process.env.COURSE_E2E === "1";
const databaseUrl = process.env.DATABASE_URL || "";
const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3000";
const suffix = randomUUID().slice(0, 8);
const password = "CourseTest123!";
const pdf = Buffer.from("%PDF-1.4\n% CH Elevate test document\n%%EOF\n");

test.describe("CH Elevate course portal", () => {
  test.skip(!enabled, "Set COURSE_E2E=1 to run the isolated database-backed course tests.");
  test.describe.configure({ mode: "serial" });

  let pool: Pool;
  let anonymous: APIRequestContext;
  let admin: APIRequestContext;
  let studentA: APIRequestContext;
  let studentB: APIRequestContext;
  let coordinator: APIRequestContext;
  let participant: APIRequestContext;
  let unrelated: APIRequestContext;
  let adminEmail: string;
  let studentAEmail: string;
  let studentBEmail: string;
  let coordinatorEmail: string;
  let participantEmail: string;
  let unrelatedEmail: string;
  let courseId: string;
  let offeringId: string;
  let otherOfferingId: string;
  let registrationAId: string;
  let registrationBId: string;
  let participantAId: string;
  let latestCourseMaterialId: string;
  let archivedCourseMaterialId: string;
  let invoiceId: string;
  let receiptId: string;
  let certificateId: string;
  let certificateNumber: string;
  let organisationRegistrationId: string;
  let organisationParticipantId: string;

  async function account(email: string, name: string) {
    const context = await playwrightRequest.newContext({ baseURL });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await context.post("/api/auth/sign-up/email", { data: { name, email, password } });
      if (response.ok()) return context;
      if (response.status() !== 429 || attempt === 3) expect(response.ok(), await response.text()).toBeTruthy();
      const retryAfter = Number(response.headers()["retry-after"] || 10);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 + 250));
    }
    throw new Error("Account could not be created after rate-limit retries.");
  }

  async function postApplication(offering: string, email: string, name: string, organisationName = "", participants = [{ name, email, phone: "+1 876 555 0100" }]) {
    return anonymous.post("/api/courses", { data: { offeringId: offering, applicantName: name, applicantEmail: email, applicantPhone: "+1 876 555 0100", organisationName, participants, consent: true } });
  }

  async function portal(context: APIRequestContext) {
    const response = await context.get("/api/portal");
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).data;
  }

  test.beforeAll(async () => {
    const url = new URL(databaseUrl);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55434') throw new Error("Course E2E tests require the task-owned loopback PostgreSQL cluster on port 55434.");
    pool = new Pool({ connectionString: databaseUrl });
    anonymous = await playwrightRequest.newContext({ baseURL });
    adminEmail = `admin-${suffix}@test.local`;
    studentAEmail = `student-a-${suffix}@test.local`;
    studentBEmail = `student-b-${suffix}@test.local`;
    coordinatorEmail = `coordinator-${suffix}@test.local`;
    participantEmail = `participant-${suffix}@test.local`;
    unrelatedEmail = `unrelated-${suffix}@test.local`;
    admin = await account(adminEmail, "Test Administrator");
    studentA = await account(studentAEmail, "Student Alpha");
    studentB = await account(studentBEmail, "Student Beta");
    coordinator = await account(coordinatorEmail, "Organisation Coordinator");
    participant = await account(participantEmail, "Organisation Participant");
    unrelated = await account(unrelatedEmail, "Unrelated Coordinator");
    await pool.query(`update profiles set role = 'client_admin' from "user" where profiles.auth_user_id = "user".id and "user".email = $1`, [adminEmail]);
  });

  test.afterAll(async () => {
    await Promise.all([anonymous, admin, studentA, studentB, coordinator, participant, unrelated].filter(Boolean).map((context) => context.dispose()));
    await pool?.end();
  });

  test("enforces anonymous, customer, staff, and administrator boundaries", async () => {
    expect((await anonymous.get("/api/admin/courses")).status()).toBe(401);
    expect((await studentA.get("/api/admin/courses")).status()).toBe(403);
    await pool.query(`update profiles set role = 'staff' from "user" where profiles.auth_user_id = "user".id and "user".email = $1`, [studentAEmail]);
    expect((await studentA.get("/api/admin/courses")).status()).toBe(403);
    expect((await studentA.get("/api/portal")).status()).toBe(403);
    await pool.query(`update profiles set role = 'customer' from "user" where profiles.auth_user_id = "user".id and "user".email = $1`, [studentAEmail]);
    expect((await admin.get("/api/admin/courses")).status()).toBe(200);
  });

  test("creates catalogue offerings and validates registration windows", async () => {
    const courseResponse = await admin.post("/api/admin/courses", { data: { kind: "course", title: `Course Portal Test ${suffix}`, slug: `course-portal-test-${suffix}`, summary: "A complete test course for portal verification.", description: "This course verifies registration, access, payments, attendance, and certificates.", isActive: true } });
    expect(courseResponse.status(), await courseResponse.text()).toBe(201);
    courseId = (await courseResponse.json()).data.id;
    const startsAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const endsAt = new Date(Date.now() + 31 * 86400000).toISOString();
    const offering = await admin.post("/api/admin/courses", { data: { kind: "offering", courseId, code: `HARD-${suffix}`, startsAt, endsAt, deliveryMode: "blended", venue: "Kingston Training Centre", joiningInstructions: "Joining instructions are released after approval.", feeCents: 2500000, currency: "JMD", capacityMode: "hard", capacity: 1, registrationOpensAt: null, registrationClosesAt: new Date(Date.now() + 10 * 86400000).toISOString(), substitutionCutoffAt: new Date(Date.now() + 20 * 86400000).toISOString(), isPublished: true } });
    expect(offering.status(), await offering.text()).toBe(201);
    offeringId = (await offering.json()).data.id;
    const other = await admin.post("/api/admin/courses", { data: { kind: "offering", courseId, code: `OTHER-${suffix}`, startsAt: new Date(Date.now() + 60 * 86400000).toISOString(), endsAt: new Date(Date.now() + 61 * 86400000).toISOString(), deliveryMode: "virtual", venue: "", joiningInstructions: "Private meeting link", feeCents: 1000000, currency: "JMD", capacityMode: "unlimited", capacity: null, registrationOpensAt: null, registrationClosesAt: null, substitutionCutoffAt: null, isPublished: true } });
    expect(other.status(), await other.text()).toBe(201);
    otherOfferingId = (await other.json()).data.id;
    const catalogue = await anonymous.get("/api/courses");
    expect(catalogue.status()).toBe(200);
    expect((await catalogue.json()).data.map((row: { id: string }) => row.id)).toContain(offeringId);
  });

  test("links existing accounts, prevents duplicates, and hard-waitlists correctly", async () => {
    const applicationA = await postApplication(offeringId, studentAEmail, "Student Alpha");
    expect(applicationA.status(), await applicationA.text()).toBe(201);
    registrationAId = (await applicationA.json()).data.id;
    expect((await portal(studentA)).registrations[0].participant.status).toBe("pending_review");
    expect((await postApplication(offeringId, studentAEmail, "Student Alpha")).status()).toBe(409);

    const applicationB = await postApplication(offeringId, studentBEmail, "Student Beta");
    expect(applicationB.status(), await applicationB.text()).toBe(201);
    registrationBId = (await applicationB.json()).data.id;
    const approvalA = await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: registrationAId, status: "approved", overrideCapacity: false } });
    expect((await approvalA.json()).data.status).toBe("approved");
    const approvalB = await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: registrationBId, status: "approved", overrideCapacity: false } });
    expect((await approvalB.json()).data.status).toBe("waitlisted");
    const aData = await portal(studentA);
    const bData = await portal(studentB);
    participantAId = aData.registrations[0].participant.id;
    expect(aData.registrations[0].participant.status).toBe("approved");
    expect(bData.registrations[0].participant.status).toBe("waitlisted");
    expect(bData.materials).toHaveLength(0);
  });

  test("uploads versioned private materials with exact course and offering scope", async () => {
    const upload = async (title: string, offering: string, name: string, mimeType = "application/pdf", buffer = pdf) => admin.post("/api/admin/courses/materials", { multipart: { title, courseId, offeringId: offering, file: { name, mimeType, buffer } } });
    const first = await upload("Course handbook", "", "handbook-v1.pdf");
    expect(first.status(), await first.text()).toBe(201);
    archivedCourseMaterialId = (await first.json()).data.id;
    const second = await upload("Course handbook", "", "handbook-v2.pdf");
    expect(second.status(), await second.text()).toBe(201);
    latestCourseMaterialId = (await second.json()).data.id;
    const scoped = await upload("Session workbook", offeringId, "session-workbook.pdf");
    expect(scoped.status()).toBe(201);
    const otherScoped = await upload("Other cohort only", otherOfferingId, "other-cohort.pdf");
    expect(otherScoped.status()).toBe(201);
    const invalid = await upload("Unsafe file", "", "unsafe.exe", "application/x-msdownload", Buffer.from("MZ"));
    expect(invalid.status()).toBe(422);

    const aData = await portal(studentA);
    expect(aData.materials.map((item: { title: string }) => item.title).sort()).toEqual(["Course handbook", "Session workbook"]);
    expect(aData.materials.find((item: { title: string; version: number }) => item.title === "Course handbook").version).toBe(2);
    expect((await studentA.get(`/api/portal/downloads/material/${latestCourseMaterialId}`)).status()).toBe(200);
    expect((await studentA.get(`/api/portal/downloads/material/${archivedCourseMaterialId}`)).status()).toBe(404);
    expect((await studentB.get(`/api/portal/downloads/material/${latestCourseMaterialId}`)).status()).toBe(403);
  });

  test("tracks invoices, payments, attendance, certificates, verification, and downloads", async () => {
    const invoice = await admin.post("/api/admin/courses/invoices", { multipart: { registrationId: registrationAId, reference: `INV-${suffix}`, amountCents: "2500000", dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), notes: "Offline payment test", file: { name: "invoice.pdf", mimeType: "application/pdf", buffer: pdf } } });
    expect(invoice.status(), await invoice.text()).toBe(201);
    invoiceId = (await invoice.json()).data.id;
    expect((await studentA.get(`/api/portal/downloads/invoice/${invoiceId}`)).status()).toBe(200);
    expect((await studentB.get(`/api/portal/downloads/invoice/${invoiceId}`)).status()).toBe(403);
    const payment = await admin.patch("/api/admin/courses", { data: { action: "payment", id: registrationAId, paymentStatus: "paid", paymentReference: `BANK-${suffix}` } });
    expect(payment.status()).toBe(200);
    expect((await portal(studentA)).registrations[0].registration.paymentStatus).toBe("paid");
    const receipt = await admin.post("/api/admin/courses/invoices", { multipart: { registrationId: registrationAId, documentType: "receipt", reference: `RCPT-${suffix}`, amountCents: "2500000", dueAt: "", notes: "Offline payment receipt", file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: pdf } } });
    expect(receipt.status(), await receipt.text()).toBe(201);
    receiptId = (await receipt.json()).data.id;
    expect((await studentA.get(`/api/portal/downloads/receipt/${receiptId}`)).status()).toBe(200);
    expect((await studentA.get(`/api/portal/downloads/invoice/${receiptId}`)).status()).toBe(404);
    expect((await portal(studentA)).invoices.some((document: { documentType: string }) => document.documentType === "receipt")).toBeTruthy();
    expect(Number((await pool.query(`select count(*) from course_payment_records where registration_id = $1`, [registrationAId])).rows[0].count)).toBeGreaterThanOrEqual(3);

    expect((await admin.patch("/api/admin/courses", { data: { action: "certificate", participantId: participantAId } })).status()).toBe(409);
    expect((await admin.patch("/api/admin/courses", { data: { action: "attendance", participantIds: [participantAId], attendance: "attended", complete: true } })).status()).toBe(200);
    const certificate = await admin.patch("/api/admin/courses", { data: { action: "certificate", participantId: participantAId } });
    expect(certificate.status(), await certificate.text()).toBe(200);
    const firstCertificate = (await certificate.json()).data;
    certificateId = firstCertificate.id;
    certificateNumber = firstCertificate.certificateNumber;
    const repeated = await admin.patch("/api/admin/courses", { data: { action: "certificate", participantId: participantAId } });
    expect((await repeated.json()).data.id).toBe(certificateId);
    const verifyExact = await anonymous.get(`/api/certificates/verify?number=${certificateNumber}`);
    expect(verifyExact.status()).toBe(200);
    expect((await verifyExact.json()).data.participantName).toBe("Student Alpha");
    expect((await anonymous.get(`/api/certificates/verify?number=${certificateNumber.slice(0, -1)}`)).status()).toBe(404);
    const certificatePdf = await studentA.get(`/api/portal/downloads/certificate/${certificateId}`);
    expect(certificatePdf.status()).toBe(200);
    expect((await certificatePdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    expect((await studentB.get(`/api/portal/downloads/certificate/${certificateId}`)).status()).toBe(403);
    expect((await studentA.patch("/api/portal", { data: { action: "cancel_request", participantId: participantAId } })).status()).toBe(200);
  });

  test("isolates organisation participants while giving coordinators bounded roster access", async () => {
    const response = await postApplication(otherOfferingId, coordinatorEmail, "Organisation Coordinator", `Test Organisation ${suffix}`, [{ name: "Organisation Participant", email: participantEmail, phone: "" }]);
    expect(response.status(), await response.text()).toBe(201);
    organisationRegistrationId = (await response.json()).data.id;
    const approval = await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: organisationRegistrationId, status: "approved", overrideCapacity: false } });
    expect(approval.status(), await approval.text()).toBe(200);
    const coordinatorData = await portal(coordinator);
    const participantData = await portal(participant);
    organisationParticipantId = participantData.registrations[0].participant.id;
    expect(coordinatorData.registrations.some((row: { participant: { email: string } }) => row.participant.email === participantEmail)).toBeTruthy();
    expect(participantData.registrations).toHaveLength(1);
    expect((await portal(unrelated)).registrations).toHaveLength(0);
    const added = await coordinator.patch("/api/portal", { data: { action: "add_participant", registrationId: organisationRegistrationId, name: "Replacement Seat", email: `new-seat-${suffix}@test.local`, phone: "" } });
    expect(added.status(), await added.text()).toBe(200);
    const replacement = await coordinator.patch("/api/portal", { data: { action: "replace_participant", participantId: organisationParticipantId, name: "Approved Replacement", email: `approved-replacement-${suffix}@test.local`, phone: "" } });
    expect(replacement.status(), await replacement.text()).toBe(200);
    expect((await portal(coordinator)).registrations.some((row: { participant: { email: string; status: string } }) => row.participant.email === `approved-replacement-${suffix}@test.local` && row.participant.status === "pending_review")).toBeTruthy();
    const forbiddenParticipantChange = await participant.patch("/api/portal", { data: { action: "replace_participant", participantId: organisationParticipantId, name: "Unauthorized Change", email: participantEmail, phone: "" } });
    expect(forbiddenParticipantChange.status()).toBe(403);
    const forbiddenCrossOrganisation = await unrelated.patch("/api/portal", { data: { action: "replace_participant", participantId: organisationParticipantId, name: "Cross Org", email: participantEmail, phone: "" } });
    expect(forbiddenCrossOrganisation.status()).toBe(403);
  });

  test("issues and accepts a one-time portal invitation after approval", async () => {
    const invitedEmail = `invited-${suffix}@test.local`;
    const application = await postApplication(otherOfferingId, invitedEmail, "Invited Student");
    expect(application.status(), await application.text()).toBe(201);
    const registrationId = (await application.json()).data.id;
    const approval = await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: registrationId, status: "approved", overrideCapacity: false } });
    expect(approval.status(), await approval.text()).toBe(200);
    let invitation = "";
    await expect.poll(async () => {
      const smtpLines = (await readFile("D:/CodexData/temp/ch-elevate-smtp.jsonl", "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line) as { message: string });
      invitation = smtpLines.map((line) => line.message.replace(/=\r?\n/g, "")).reverse().find((message) => message.includes(invitedEmail) && message.includes("/portal/activate?token")) || "";
      return invitation.length;
    }).toBeGreaterThan(0);
    expect(invitation).toBeTruthy();
    const token = invitation!.match(/token(?:=3D|=)([A-Za-z0-9_-]{40,})/)?.[1];
    expect(token).toBeTruthy();
    const invited = await account(invitedEmail, "Invited Student");
    const accepted = await invited.post("/api/portal/invitations/accept", { data: { token } });
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect((await portal(invited)).registrations[0].participant.status).toBe("approved");
    expect((await invited.post("/api/portal/invitations/accept", { data: { token } })).status()).toBe(409);
    await invited.dispose();
  });

  test("serializes concurrent final-seat approvals and promotes a waitlisted registration", async () => {
    const startsAt = new Date(Date.now() + 90 * 86400000).toISOString();
    const offering = await admin.post("/api/admin/courses", { data: { kind: "offering", courseId, code: `RACE-${suffix}`, startsAt, endsAt: new Date(Date.now() + 91 * 86400000).toISOString(), deliveryMode: "virtual", venue: "", joiningInstructions: "", feeCents: 0, currency: "JMD", capacityMode: "hard", capacity: 1, registrationOpensAt: null, registrationClosesAt: null, substitutionCutoffAt: null, isPublished: true } });
    const raceOfferingId = (await offering.json()).data.id;
    const emailOne = `race-one-${suffix}@test.local`, emailTwo = `race-two-${suffix}@test.local`;
    const one = await postApplication(raceOfferingId, emailOne, "Race One");
    const two = await postApplication(raceOfferingId, emailTwo, "Race Two");
    const oneId = (await one.json()).data.id, twoId = (await two.json()).data.id;
    const results = await Promise.all([oneId, twoId].map(async (id) => ({ id, status: (await (await admin.patch("/api/admin/courses", { data: { action: "registration_status", id, status: "approved", overrideCapacity: false } })).json()).data.status })));
    expect(results.map((result) => result.status).sort()).toEqual(["approved", "waitlisted"]);
    const approvedId = results.find((result) => result.status === "approved")!.id;
    const waitlistedId = approvedId === oneId ? twoId : oneId;
    const three = await postApplication(raceOfferingId, `race-three-${suffix}@test.local`, "Race Three");
    const threeId = (await three.json()).data.id;
    expect((await (await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: threeId, status: "approved", overrideCapacity: false } })).json()).data.status).toBe("waitlisted");
    expect((await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: approvedId, status: "cancelled", overrideCapacity: false } })).status()).toBe(200);
    expect((await (await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: threeId, status: "approved", overrideCapacity: false } })).json()).data.status).toBe("waitlisted");
    const promotion = await admin.patch("/api/admin/courses", { data: { action: "registration_status", id: waitlistedId, status: "approved", overrideCapacity: false } });
    expect((await promotion.json()).data.status).toBe("approved");
  });

  test("imports organisation rosters and rejects duplicate CSV participants", async () => {
    const csv = Buffer.from(`name,email,phone\nRoster One,roster-one-${suffix}@test.local,8765550123\nRoster Two,roster-two-${suffix}@test.local,8765550124\n`);
    const imported = await admin.post("/api/admin/courses/roster", { multipart: { offeringId: otherOfferingId, organisationName: `CSV Organisation ${suffix}`, applicantName: "CSV Coordinator", applicantEmail: `csv-coordinator-${suffix}@test.local`, file: { name: "roster.csv", mimeType: "text/csv", buffer: csv } } });
    expect(imported.status(), await imported.text()).toBe(201);
    const duplicateCsv = Buffer.from(`name,email\nOne,duplicate-${suffix}@test.local\nTwo,duplicate-${suffix}@test.local\n`);
    const rejected = await admin.post("/api/admin/courses/roster", { multipart: { offeringId: otherOfferingId, organisationName: `Duplicate Organisation ${suffix}`, applicantName: "CSV Coordinator", applicantEmail: `csv-coordinator-2-${suffix}@test.local`, file: { name: "duplicate.csv", mimeType: "text/csv", buffer: duplicateCsv } } });
    expect(rejected.status()).toBe(409);
  });

  test("bulk-approves registrations and sends schedule-change and cancellation notices", async () => {
    const startsAt = new Date(Date.now() + 120 * 86400000);
    const offeringResponse = await admin.post("/api/admin/courses", { data: { kind: "offering", courseId, code: `MANAGE-${suffix}`, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 86400000).toISOString(), deliveryMode: "in_person", venue: "Original venue", joiningInstructions: "Original details", feeCents: 0, currency: "JMD", capacityMode: "unlimited", capacity: null, registrationOpensAt: null, registrationClosesAt: null, substitutionCutoffAt: null, isPublished: true } });
    expect(offeringResponse.status(), await offeringResponse.text()).toBe(201);
    const managedOfferingId = (await offeringResponse.json()).data.id;
    const managedOneEmail = `managed-one-${suffix}@test.local`, managedTwoEmail = `managed-two-${suffix}@test.local`;
    const managedOne = await account(managedOneEmail, "Managed One");
    const managedTwo = await account(managedTwoEmail, "Managed Two");
    const applicationOne = await postApplication(managedOfferingId, managedOneEmail, "Managed One");
    const applicationTwo = await postApplication(managedOfferingId, managedTwoEmail, "Managed Two");
    const registrationIds = [(await applicationOne.json()).data.id, (await applicationTwo.json()).data.id];
    const bulk = await admin.patch("/api/admin/courses", { data: { action: "bulk_registration_status", ids: registrationIds, status: "approved", overrideCapacity: false } });
    expect(bulk.status(), await bulk.text()).toBe(200);
    expect((await bulk.json()).data.map((row: { status: string }) => row.status)).toEqual(["approved", "approved"]);
    const changedStart = new Date(startsAt.getTime() + 2 * 86400000);
    const schedule = await admin.patch("/api/admin/courses", { data: { action: "offering_update", id: managedOfferingId, startsAt: changedStart.toISOString(), endsAt: new Date(changedStart.getTime() + 86400000).toISOString(), deliveryMode: "blended", venue: "Updated venue", joiningInstructions: "Updated joining details", feeCents: 0, currency: "JMD", capacityMode: "unlimited", capacity: null, registrationOpensAt: null, registrationClosesAt: null, substitutionCutoffAt: null, isPublished: true } });
    expect(schedule.status(), await schedule.text()).toBe(200);
    expect((await portal(managedOne)).registrations[0].offering.venue).toBe("Updated venue");
    const cancellation = await admin.patch("/api/admin/courses", { data: { action: "offering_cancel", id: managedOfferingId } });
    expect(cancellation.status(), await cancellation.text()).toBe(200);
    expect((await portal(managedOne)).registrations[0].participant.status).toBe("cancelled");
    expect((await portal(managedTwo)).materials).toHaveLength(0);
    expect((await postApplication(managedOfferingId, `late-${suffix}@test.local`, "Late Applicant")).status()).toBe(409);
    const catalogue = await (await anonymous.get("/api/courses")).json();
    expect(catalogue.data.map((row: { id: string }) => row.id)).not.toContain(managedOfferingId);
    const smtp = await readFile("D:/CodexData/temp/ch-elevate-smtp.jsonl", "utf8");
    expect(smtp).toContain("course schedule updated");
    expect(smtp).toContain("course cancelled");
    await managedOne.dispose();
    await managedTwo.dispose();
  });

  test("records required audit events and transactional emails", async () => {
    const actions = (await pool.query(`select distinct action from audit_logs where action like 'course.%'`)).rows.map((row) => row.action);
    for (const action of ["course.registration_submitted", "course.registration_status_updated", "course.material_uploaded", "course.material_downloaded", "course.invoice_uploaded", "course.invoice_downloaded", "course.receipt_uploaded", "course.receipt_downloaded", "course.payment_updated", "course.attendance_updated", "course.certificate_issued", "course.certificate_downloaded", "course.cancellation_requested", "course.roster_imported", "course.offering_updated", "course.offering_cancelled"]) expect(actions).toContain(action);
    const smtp = await readFile("D:/CodexData/temp/ch-elevate-smtp.jsonl", "utf8");
    expect(smtp).toContain("course registration received");
    expect(smtp).toContain("course registration is approved");
    expect(smtp).toContain("payment status updated");
    expect(smtp).toContain("certificate is ready");
  });

  test("edits a full student profile through the real browser with a clean console", async ({ page }) => {
    const consoleProblems: string[] = [];
    page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text()); });
    await page.goto("/portal/login");
    await page.getByLabel("Email address").fill(studentAEmail);
    await page.getByLabel("Password").fill(password);
    await page.waitForTimeout(750);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/portal");
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Personal profile" })).toBeVisible();
    await page.getByLabel("Phone number").fill("+1 876 555 0199");
    await page.getByLabel("Job title").fill("Programme Manager");
    await page.getByLabel("Country").fill("Jamaica");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile updated successfully.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Job title")).toHaveValue("Programme Manager");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(consoleProblems).toEqual([]);
  });

  test("renders accessible responsive public registration and admin course operations", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const consoleProblems: string[] = [];
    page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text()); });
    await page.goto("/portal/register");
    await expect(page.getByRole("heading", { name: "Create your student account" })).toBeVisible();
    for (const label of ["Full name", "Email address", "Password", "Confirm password"]) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    expect(await page.locator("form").getAttribute("method")).toBe("post");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

    await page.goto("/programmes#available-courses");
    await expect(page.getByRole("heading", { name: "Upcoming courses open for registration." })).toBeVisible();
    await expect(page.getByText(`Course Portal Test ${suffix}`).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

    await page.goto("/admin/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(password);
    await page.waitForTimeout(750);
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.waitForURL("**/admin");
    await page.getByRole("button", { name: "Toggle dashboard menu" }).click();
    await page.getByRole("button", { name: "Courses", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Courses & registration." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve selected/ })).toBeVisible();
    await page.getByRole("button", { name: "Courses & offerings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Update schedule" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(consoleProblems).toEqual([]);
    await context.close();
  });
});
