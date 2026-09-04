import { isValidProfileTimeZone, type StudentProfileData } from "@/lib/student-profile";
import { formatMoney } from "@/lib/courses";
export function StudentProfileContent({ data }: { data: StudentProfileData }) {
  const { posts = [], materials = [], invoices = [], certificates = [], registrations = [] } = data;
  const timeZone = isValidProfileTimeZone(data.user.timeZone) ? data.user.timeZone : "America/Jamaica";
  return <div className="student-profile-content">
    <section id="profile-updates" aria-labelledby="profile-updates-heading"><h2 id="profile-updates-heading">Updates from CH Elevate</h2><p>Private information posted for you by the administration team.</p>
      {!posts.length && <p>No updates from your administrator yet.</p>}
      {posts.map((post) => <article key={post.id}><h3>{post.title}</h3><p className="student-post-body">{post.body}</p><small>Updated {new Date(post.updatedAt).toLocaleString("en-JM", { timeZone })}</small></article>)}
    </section>
    <section id="profile-enrolments" aria-labelledby="profile-enrolments-heading"><h2 id="profile-enrolments-heading">Your enrolments</h2>
      {!registrations.length && <p>No course registrations yet.</p>}
      {registrations.map((row) => <article key={row.participant.id}><h3>{row.course.title}</h3><p>{row.offering.code} · {new Date(row.offering.startsAt).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: row.offering.timeZone })} ({row.offering.timeZone})</p>
        <dl><div><dt>Registration</dt><dd>{row.participant.status.replaceAll("_", " ")}</dd></div><div><dt>Attendance</dt><dd>{row.participant.attendance.replaceAll("_", " ")}</dd></div><div><dt>Payment</dt><dd>{row.registration.paymentStatus.replaceAll("_", " ")} · {formatMoney(row.registration.amountDueCents, row.offering.currency)}</dd></div></dl>
        {row.offering.isCancelled && <p>This offering has been cancelled. Please contact CH Elevate about next steps.</p>}
        {row.offering.venue && <p>Venue / platform: {row.offering.venue}</p>}
        {row.offering.joiningInstructions && <div><h4>Joining instructions</h4><p className="student-post-body">{row.offering.joiningInstructions}</p></div>}
      </article>)}
    </section>
    <section id="profile-documents" aria-labelledby="profile-documents-heading"><h2 id="profile-documents-heading">Your documents</h2><h3>Course materials</h3>
      {!materials.length && <p>Materials appear when your enrolment is approved and files are assigned.</p>}
      <ul className="student-profile-documents">{materials.map((file) => <li key={file.id}><div><strong>{file.title}</strong><span>{file.originalFilename} · v{file.version} · {Math.ceil(file.sizeBytes / 1024)} KB</span></div><a href={`/api/portal/downloads/material/${file.id}`} aria-label={`Download ${file.title}`}>Download</a></li>)}</ul>
      <h3>Invoices &amp; receipts</h3>{!invoices.length && <p>No payment documents assigned yet.</p>}
      <ul className="student-profile-documents">{invoices.map((file) => <li key={file.id}><div><strong>{file.reference}</strong><span>{file.documentType === "receipt" ? "Receipt" : "Invoice"} · {formatMoney(file.amountCents, registrations.find((row) => row.registration.id === file.registrationId)?.offering.currency || "JMD")}</span></div><a href={`/api/portal/downloads/${file.documentType === "receipt" ? "receipt" : "invoice"}/${file.id}`} aria-label={`Download ${file.reference}`}>Download</a></li>)}</ul>
      <h3>Certificates</h3>{!certificates.length && <p>Your issued certificates will appear here.</p>}
      <ul className="student-profile-documents">{certificates.map((file) => <li key={file.id}><div><strong>{file.courseTitle}</strong><span>{file.certificateNumber}</span></div><a href={`/api/portal/downloads/certificate/${file.id}`} aria-label={`Download certificate for ${file.courseTitle}`}>Download</a></li>)}</ul>
    </section>
  </div>;
}
