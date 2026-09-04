"use client";

import { ArrowLeft, BookOpen, CheckCircle2, LoaderCircle, LockKeyhole, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { StudentLearning } from "@/components/student-learning";
import { StudentProfileContent } from "@/components/student-profile-content";
import type { StudentProfileData } from "@/lib/student-profile";
import { authClient } from "@/lib/auth-client";

type ProfileData = StudentProfileData;

export function StudentProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null); const [message, setMessage] = useState("Loading your profile…"); const [saving, setSaving] = useState(false);
  async function load() { const response = await fetch("/api/portal?scope=profile", { cache: "no-store" }); if (response.status === 401) { window.location.assign("/portal/login"); return; } const result = await response.json() as { data?: ProfileData; error?: { message?: string } }; if (!response.ok || !result.data) { throw new Error(result.error?.message || "Profile could not be loaded."); } setData(result.data); setMessage(""); }
  useEffect(() => { fetch("/api/portal?scope=profile", { cache: "no-store" }).then(async (response) => { if (response.status === 401) { window.location.assign("/portal/login"); return null; } const result = await response.json() as { data?: ProfileData; error?: { message?: string } }; if (!response.ok || !result.data) throw new Error(result.error?.message || "Profile could not be loaded."); return result.data; }).then((result) => { if (result) { setData(result); setMessage(""); } }).catch((error) => setMessage(error instanceof Error ? error.message : "Profile could not be loaded.")); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; setSaving(true); setMessage("Saving your profile…");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/portal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_profile", displayName: form.get("displayName"), phone: form.get("phone"), jobTitle: form.get("jobTitle"), country: form.get("country"), timeZone: form.get("timeZone") }) });
      if (!response.ok) throw new Error("Profile could not be updated.");
      await load(); setMessage("Profile updated successfully.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Profile could not be updated. Please try again."); } finally { setSaving(false); }
  }
  async function signOut() {
    try { await authClient.signOut(); window.location.assign("/portal/login"); } catch { setMessage("Sign out failed. Please try again."); }
  }
  if (!data) return <main className="portal-loading"><LoaderCircle className="spin" /><h1>Student profile</h1><p>{message}</p><button type="button" onClick={() => load().catch((cause) => setMessage(cause instanceof Error ? cause.message : "Profile could not be loaded."))}>Retry profile</button></main>;
  const own = data.registrations.filter((row) => row.participant.email.toLowerCase() === data.user.email.toLowerCase()); const completed = own.filter((row) => row.participant.status === "completed").length;
  return <main className="student-profile"><header><Link href="/portal"><ArrowLeft /> Back to portal</Link><BrandLogo className="student-profile__logo" priority /></header><nav className="student-profile-nav" aria-label="Student profile sections"><a href="#personal-profile">Personal details</a><a href="#profile-updates">Admin updates</a><a href="#profile-enrolments">Enrolments</a><a href="#profile-documents">Documents</a><a href="#student-learning-heading">Lessons</a><button type="button" onClick={signOut}>Sign out</button></nav><div className="student-profile__layout" id="personal-profile"><aside><span className="student-profile__avatar">{data.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><h1>{data.user.name}</h1><p>{data.user.email}</p>{data.memberships[0] && <dl><div><dt>Organisation</dt><dd>{data.memberships[0].organisationName}</dd></div><div><dt>Access</dt><dd>{data.memberships[0].role}</dd></div></dl>}<div className="student-profile__stats"><div><BookOpen /><strong>{own.length}</strong><span>Courses</span></div><div><CheckCircle2 /><strong>{completed}</strong><span>Completed</span></div></div></aside><section><div className="student-profile__heading"><div><UserRound /><div><h2>Personal profile</h2><p>Keep your contact and professional details current.</p></div></div><Link href="/portal/forgot-password"><LockKeyhole /> Change password</Link></div><form onSubmit={submit}><label><span>Full name</span><input name="displayName" defaultValue={data.user.name} required /></label><label><span>Account email</span><input value={data.user.email} readOnly aria-describedby="email-help" /><small id="email-help">Contact CH Elevate to change the email used for registration access.</small></label><label><span>Phone number</span><input name="phone" type="tel" defaultValue={data.user.phone || ""} /></label><label><span>Job title</span><input name="jobTitle" defaultValue={data.user.jobTitle || ""} /></label><label><span>Country</span><input name="country" defaultValue={data.user.country || ""} /></label><label><span>Timezone</span><select name="timeZone" defaultValue={data.user.timeZone}><option value="America/Jamaica">Jamaica (America/Jamaica)</option><option value="America/New_York">Eastern Time</option><option value="America/Toronto">Toronto</option><option value="Europe/London">London</option><option value="UTC">UTC</option></select></label><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />} Save profile</button><p className="student-profile__message" role="status">{message}</p></form></section></div><StudentProfileContent data={data} /><StudentLearning /></main>;
}
