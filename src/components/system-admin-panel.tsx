"use client";

import { Activity, Database, HardDrive, KeyRound, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

type SystemData = {
  business: { email: string; phone: string; address: string; timeZone: string; locale: string; defaultCurrency: string };
  access: { staff: { id: string; name: string; email: string; emailVerified: boolean; role: string; active: boolean; updatedAt: string }[]; activeSessions: number; mfa: { configured: boolean; note: string } };
  notifications: { smtpConfigured: boolean; bookingMailStates: Record<string, number>; operationalMailStates: Record<string, number>; attention: { id: string; channel: string; recipient: string; subject: string; state: string; attempts: number; errorCode: string | null; updatedAt: string }[]; note: string };
  health: { database: { ready: boolean }; storage: { ready: boolean; reason: string }; email: { ready: boolean } };
  audit: { latest: { action: string; createdAt: string } | null };
  recovery: { lastBackupAt: string | null; lastRestoreTestAt: string | null; buildVersion: string };
};

function State({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <span className={`system-state system-state--${ready ? "ready" : "attention"}`}>{children}</span>;
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Jamaica" }) : "Not recorded";
}

export function SystemAdminPanel() {
  const [data, setData] = useState<SystemData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/system", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.data) throw new Error(result.error?.message || "System status could not be loaded.");
      setData(result.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "System status could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/system", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.data) throw new Error(result.error?.message || "System status could not be loaded.");
        return result.data as SystemData;
      })
      .then((result) => { if (active) setData(result); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "System status could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const refresh = () => { setLoading(true); setError(""); void load(); };
  const retry = async (delivery: SystemData["notifications"]["attention"][number]) => {
    const confirmUnknown = delivery.state === "unknown";
    if (confirmUnknown && !window.confirm("The previous send may have reached the mail server. Retrying could send a duplicate. Continue?")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/system", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: delivery.id, confirmUnknown }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Delivery retry failed.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Delivery retry failed."); setLoading(false); }
  };

  return <div className="system-admin">
    <header className="cms-panel-heading"><span>Operations console</span><h1>System settings & health.</h1><p>One protected view of business defaults, administrator access, notification configuration, dependencies, audit activity, and recovery evidence. Secrets are never displayed here.</p></header>
    <button className="system-refresh" type="button" onClick={refresh} disabled={loading}><RefreshCw className={loading ? "spin" : ""} />{loading ? "Checking…" : "Refresh status"}</button>
    {error && <p className="cms-admin__notice cms-admin__notice--error" role="alert">{error}</p>}
    {data && <div className="system-grid">
      <section className="cms-card"><h2><Activity /> Business defaults</h2><dl><div><dt>Public email</dt><dd>{data.business.email}</dd></div><div><dt>Public phone</dt><dd>{data.business.phone}</dd></div><div><dt>Address</dt><dd>{data.business.address}</dd></div><div><dt>Timezone</dt><dd>{data.business.timeZone}</dd></div><div><dt>Locale / currency</dt><dd>{data.business.locale} / {data.business.defaultCurrency}</dd></div></dl><p className="system-note">Public contact details remain owned by Website Management. Offering-specific currencies remain owned by Course Registration.</p></section>
      <section className="cms-card"><h2><ShieldCheck /> Staff & access</h2><p><strong>{data.access.staff.length}</strong> administrator record(s) · <strong>{data.access.activeSessions}</strong> unexpired session(s)</p><ul className="system-list">{data.access.staff.map((member) => <li key={member.id}><span><strong>{member.name}</strong>{member.email}</span><State ready={member.active && member.emailVerified}>{member.active && member.emailVerified ? "Verified" : "Review"}</State></li>)}</ul><p className="system-note"><KeyRound /> {data.access.mfa.note} Workspace-specific permission design still requires an approved staffing matrix.</p></section>
      <section className="cms-card"><h2><Mail /> Notifications</h2><p><State ready={data.notifications.smtpConfigured}>{data.notifications.smtpConfigured ? "SMTP configured" : "SMTP needs attention"}</State></p><h3>Booking mail</h3><dl>{Object.entries(data.notifications.bookingMailStates).map(([state, value]) => <div key={state}><dt>{state.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl><h3>Course & website mail</h3><dl>{Object.entries(data.notifications.operationalMailStates).map(([state, value]) => <div key={state}><dt>{state.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl>{data.notifications.attention.length > 0 && <ul className="system-list">{data.notifications.attention.map((delivery) => <li key={delivery.id}><span><strong>{delivery.subject}</strong>{delivery.channel} · {delivery.recipient} · {delivery.state} · {delivery.attempts} attempt(s){delivery.errorCode ? ` · ${delivery.errorCode}` : ""}</span>{["failed", "unknown"].includes(delivery.state) && <button className="course-table-action" type="button" disabled={loading} onClick={() => retry(delivery)}>Retry{delivery.state === "unknown" ? " uncertain send" : ""}</button>}</li>)}</ul>}<p className="system-note">{data.notifications.note}</p></section>
      <section className="cms-card"><h2><Database /> Service health</h2><ul className="system-list"><li><span><strong>Database</strong>Application data connection</span><State ready={data.health.database.ready}>{data.health.database.ready ? "Ready" : "Unavailable"}</State></li><li><span><strong>Private storage</strong>{data.health.storage.reason}</span><State ready={data.health.storage.ready}>{data.health.storage.ready ? "Ready" : "Unavailable"}</State></li><li><span><strong>Email</strong>Outbound SMTP configuration</span><State ready={data.health.email.ready}>{data.health.email.ready ? "Configured" : "Not configured"}</State></li></ul></section>
      <section className="cms-card"><h2><HardDrive /> Recovery & release</h2><dl><div><dt>Build version</dt><dd>{data.recovery.buildVersion}</dd></div><div><dt>Last successful backup</dt><dd>{date(data.recovery.lastBackupAt)}</dd></div><div><dt>Last restore test</dt><dd>{date(data.recovery.lastRestoreTestAt)}</dd></div><div><dt>Latest audit activity</dt><dd>{data.audit.latest ? `${data.audit.latest.action} · ${date(data.audit.latest.createdAt)}` : "No audit activity recorded"}</dd></div></dl><p className="system-note">Backup and restore evidence appears only when the deployment provides LAST_BACKUP_AT and LAST_RESTORE_TEST_AT.</p></section>
    </div>}
  </div>;
}
