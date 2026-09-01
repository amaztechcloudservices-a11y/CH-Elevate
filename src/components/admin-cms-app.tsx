"use client";

import {
  CalendarDays,
  ChevronRight,
  FileText,
  FormInput,
  GraduationCap,
  Globe2,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Save,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { BrandLogo } from "@/components/brand-logo";
import { CourseAdminPanel } from "@/components/course-admin-panel";
import type {
  CmsSnapshot,
  FormDefinition,
  GlobalSettings,
  HeroSlide,
  PageContent,
} from "@/lib/cms";

type Tab =
  | "overview"
  | "global"
  | "navigation"
  | "hero"
  | "pages"
  | "forms"
  | "bookings"
  | "inbox"
  | "availability"
  | "courses";

type Booking = {
  id: string;
  customerName: string;
  customerEmail: string;
  service: string;
  startsAt: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
};

type Submission = {
  id: string;
  formKey: string;
  payload: Record<string, string | string[] | boolean>;
  status: "new" | "reviewed" | "archived";
  createdAt: string;
};

const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "global", label: "Header & footer", icon: Globe2 },
  { id: "navigation", label: "Navigation", icon: Menu },
  { id: "hero", label: "Hero slider", icon: ImageIcon },
  { id: "pages", label: "Page sections", icon: FileText },
  { id: "forms", label: "Forms", icon: FormInput },
  { id: "bookings", label: "Bookings", icon: CalendarDays },
  { id: "courses", label: "Courses", icon: GraduationCap },
  { id: "inbox", label: "Form inbox", icon: Inbox },
  { id: "availability", label: "Availability", icon: Settings },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function AdminCmsApp() {
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cms, setCms] = useState<CmsSnapshot | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [status, setStatus] = useState<{
    kind: "loading" | "idle" | "saving" | "success" | "error";
    message: string;
  }>({ kind: "loading", message: "Loading website controls…" });

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/cms", { cache: "no-store" }),
      fetch("/api/admin/bookings", { cache: "no-store" }),
      fetch("/api/admin/submissions", { cache: "no-store" }),
    ])
      .then(async ([cmsResponse, bookingsResponse, submissionsResponse]) => {
        if (cmsResponse.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        if (!cmsResponse.ok) throw new Error("Website controls could not be loaded.");
        const cmsResult = (await cmsResponse.json()) as { data: CmsSnapshot };
        const bookingsResult = bookingsResponse.ok
          ? ((await bookingsResponse.json()) as { data: Booking[] })
          : { data: [] };
        const submissionsResult = submissionsResponse.ok
          ? ((await submissionsResponse.json()) as { data: Submission[] })
          : { data: [] };
        setCms(cmsResult.data);
        setBookings(bookingsResult.data);
        setSubmissions(submissionsResult.data);
        setStatus({ kind: "idle", message: "" });
      })
      .catch((error) => {
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "The dashboard could not be loaded.",
        });
      });
  }, []);

  async function save() {
    if (!cms) return;
    setStatus({ kind: "saving", message: "Saving and publishing…" });
    const response = await fetch("/api/admin/cms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cms),
    });
    const result = (await response.json()) as {
      data?: CmsSnapshot;
      error?: { message?: string };
    };
    if (!response.ok || !result.data) {
      setStatus({
        kind: "error",
        message: result.error?.message || "Changes could not be saved.",
      });
      return;
    }
    setCms(result.data);
    setStatus({ kind: "success", message: "Published. The public site now uses these settings." });
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/admin/login");
  }

  if (!cms) {
    return (
      <main className="admin-loading">
        <LoaderCircle className="spin" aria-hidden="true" />
        <h1>{status.kind === "error" ? "Administration is unavailable" : "Loading administration"}</h1>
        <p>{status.message}</p>
        {status.kind === "error" && <Link className="button button--accent" href="/admin/login">Sign in</Link>}
      </main>
    );
  }

  const activeLabel = tabs.find((item) => item.id === tab)?.label;

  return (
    <main className="cms-admin">
      <aside className={`cms-admin__sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link className="cms-admin__brand" href="/" target="_blank">
          <BrandLogo className="brand-logo__image" priority />
        </Link>
        <nav aria-label="Administration sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setMobileOpen(false);
              }}
            >
              <Icon aria-hidden="true" /> {label} <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </nav>
        <button className="cms-admin__signout" type="button" onClick={signOut}>
          <LogOut aria-hidden="true" /> Sign out
        </button>
      </aside>

      <section className="cms-admin__main">
        <header className="cms-admin__topbar">
          <button type="button" className="cms-admin__mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Toggle dashboard menu">
            <Menu aria-hidden="true" />
          </button>
          <div><span>Website controls</span><strong>{activeLabel}</strong></div>
          <div className="cms-admin__actions">
            <Link href="/" target="_blank">View site</Link>
            <button type="button" onClick={save} disabled={status.kind === "saving"}>
              {status.kind === "saving" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              Save & publish
            </button>
          </div>
        </header>
        <div className="cms-admin__content">
          {status.message && <p className={`cms-admin__notice cms-admin__notice--${status.kind}`} role="status">{status.message}</p>}
          {tab === "overview" && <Overview bookings={bookings} submissions={submissions} cms={cms} setTab={setTab} />}
          {tab === "global" && <GlobalEditor settings={cms.settings} onChange={(settings) => setCms({ ...cms, settings })} />}
          {tab === "navigation" && <NavigationEditor settings={cms.settings} onChange={(settings) => setCms({ ...cms, settings })} />}
          {tab === "hero" && <HeroEditor slides={cms.heroSlides} onChange={(heroSlides) => setCms({ ...cms, heroSlides })} />}
          {tab === "pages" && <PagesEditor pages={cms.pages} onChange={(pages) => setCms({ ...cms, pages })} />}
          {tab === "forms" && <FormsEditor forms={cms.forms} onChange={(forms) => setCms({ ...cms, forms })} />}
          {tab === "bookings" && <BookingsPanel bookings={bookings} setBookings={setBookings} />}
          {tab === "inbox" && <InboxPanel submissions={submissions} setSubmissions={setSubmissions} />}
          {tab === "courses" && <CourseAdminPanel />}
          {tab === "availability" && (
            <AvailabilityEditor cms={cms} onChange={setCms} />
          )}
        </div>
      </section>
    </main>
  );
}

function PanelHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="cms-panel-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>;
}

function Overview({ bookings, submissions, cms, setTab }: { bookings: Booking[]; submissions: Submission[]; cms: CmsSnapshot; setTab: (tab: Tab) => void }) {
  const cards: [string, string, Tab][] = [
    ["Upcoming bookings", String(bookings.filter((item) => ["pending", "confirmed"].includes(item.status)).length), "bookings"],
    ["New submissions", String(submissions.filter((item) => item.status === "new").length), "inbox"],
    ["Active hero slides", String(cms.heroSlides.filter((item) => item.isActive).length), "hero"],
    ["Published pages", String(cms.pages.filter((item) => item.isPublished).length), "pages"],
  ];
  return (
    <>
      <PanelHeading eyebrow="Control centre" title="Everything in one place." copy="Edit structured content, publish updates, and manage the complete enquiry and booking workflow." />
      <div className="cms-metrics">{cards.map(([label, value, destination]) => (
        <button key={label} type="button" onClick={() => setTab(destination)}><span>{label}</span><strong>{value}</strong><ChevronRight aria-hidden="true" /></button>
      ))}</div>
      <section className="cms-card"><h2>Website status</h2><div className="cms-status-grid"><p><strong>Navigation</strong>{cms.settings.navigation.filter((item) => item.isVisible).length} live links</p><p><strong>Forms</strong>{cms.forms.filter((form) => form.isActive).length} active forms</p><p><strong>Time zone</strong>{cms.availability.timeZone}</p><p><strong>Booking duration</strong>{cms.availability.slotMinutes} minutes</p></div></section>
    </>
  );
}

function GlobalEditor({ settings, onChange }: { settings: GlobalSettings; onChange: (settings: GlobalSettings) => void }) {
  const update = (key: keyof GlobalSettings, value: string) => onChange({ ...settings, [key]: value });
  return (
    <>
      <PanelHeading eyebrow="Global content" title="Header, footer & contact details." copy="These values are shared across every page. Phone, email, address, CTA, map, and social links update site-wide." />
      <section className="cms-card cms-form-grid">
        <label><span>Brand name</span><input value={settings.brandName} onChange={(e) => update("brandName", e.target.value)} /></label>
        <label><span>Brand tagline</span><input value={settings.brandTagline} onChange={(e) => update("brandTagline", e.target.value)} /></label>
        <label><span>Header CTA label</span><input value={settings.headerCtaLabel} onChange={(e) => update("headerCtaLabel", e.target.value)} /></label>
        <label><span>Header CTA destination</span><input value={settings.headerCtaHref} onChange={(e) => update("headerCtaHref", e.target.value)} /></label>
        <label><span>Public email</span><input type="email" value={settings.footerEmail} onChange={(e) => update("footerEmail", e.target.value)} /></label>
        <label><span>Public phone</span><input value={settings.footerPhone} onChange={(e) => update("footerPhone", e.target.value)} /></label>
        <label className="wide"><span>Office address</span><textarea value={settings.footerAddress} onChange={(e) => update("footerAddress", e.target.value)} /></label>
        <label className="wide"><span>Footer summary</span><textarea value={settings.footerSummary} onChange={(e) => update("footerSummary", e.target.value)} /></label>
        <label className="wide"><span>Map embed URL</span><input value={settings.mapEmbedUrl} onChange={(e) => update("mapEmbedUrl", e.target.value)} /></label>
        <label className="wide"><span>Map directions URL</span><input value={settings.mapDirectionsUrl} onChange={(e) => update("mapDirectionsUrl", e.target.value)} /></label>
        <label className="wide"><span>Copyright</span><input value={settings.copyright} onChange={(e) => update("copyright", e.target.value)} /></label>
      </section>
      <LinkListEditor title="Footer company links" items={settings.footerCompanyLinks} onChange={(footerCompanyLinks) => onChange({ ...settings, footerCompanyLinks })} />
      <LinkListEditor title="Social links" items={settings.socialLinks} onChange={(socialLinks) => onChange({ ...settings, socialLinks })} />
    </>
  );
}

function NavigationEditor({ settings, onChange }: { settings: GlobalSettings; onChange: (settings: GlobalSettings) => void }) {
  return (
    <>
      <PanelHeading eyebrow="Shared menu" title="One navigation for every page." copy="Reorder by changing the list, rename labels, update destinations, or hide an item. There is no Pages placeholder." />
      <LinkListEditor title="Primary navigation" items={settings.navigation} onChange={(navigation) => onChange({ ...settings, navigation })} allowAdd />
    </>
  );
}

function LinkListEditor({ title, items, onChange, allowAdd = true }: { title: string; items: GlobalSettings["navigation"]; onChange: (items: GlobalSettings["navigation"]) => void; allowAdd?: boolean }) {
  return (
    <section className="cms-card">
      <div className="cms-card__heading"><h2>{title}</h2>{allowAdd && <button type="button" onClick={() => onChange([...items, { id: crypto.randomUUID(), label: "New link", href: "/", isVisible: true, newTab: false }])}><Plus aria-hidden="true" /> Add link</button>}</div>
      <div className="cms-list-editor">{items.map((item, index) => (
        <article key={item.id}>
          <span className="cms-list-editor__number">{String(index + 1).padStart(2, "0")}</span>
          <label><span>Label</span><input value={item.label} onChange={(e) => { const next = clone(items); next[index].label = e.target.value; onChange(next); }} /></label>
          <label><span>Destination</span><input value={item.href} onChange={(e) => { const next = clone(items); next[index].href = e.target.value; onChange(next); }} /></label>
          <label className="cms-check"><input type="checkbox" checked={item.isVisible} onChange={(e) => { const next = clone(items); next[index].isVisible = e.target.checked; onChange(next); }} /><span>Visible</span></label>
          <button className="cms-delete" type="button" onClick={() => onChange(items.filter((entry) => entry.id !== item.id))} aria-label={`Delete ${item.label}`}><Trash2 aria-hidden="true" /></button>
        </article>
      ))}</div>
    </section>
  );
}

function HeroEditor({ slides, onChange }: { slides: HeroSlide[]; onChange: (slides: HeroSlide[]) => void }) {
  const [page, setPage] = useState("home");
  const pageSlides = slides.filter((slide) => slide.pageSlug === page).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      <PanelHeading eyebrow="Hero slider" title="Manage every hero banner." copy="Each page can use one or more ordered slides with its own image, copy, CTA, and visibility." />
      <div className="cms-toolbar"><label><span>Page</span><select value={page} onChange={(e) => setPage(e.target.value)}>{["home", "about", "services", "portfolio", "faq", "contact"].map((slug) => <option key={slug}>{slug}</option>)}</select></label><button type="button" onClick={() => onChange([...slides, { id: crypto.randomUUID(), pageSlug: page, eyebrow: "", title: "New hero slide", description: "", imageUrl: "/images/diverse-business-shoot.jpg", primaryCtaLabel: "", primaryCtaHref: "", sortOrder: pageSlides.length, isActive: true }])}><Plus aria-hidden="true" /> Add slide</button></div>
      <div className="cms-stack">{pageSlides.map((slide) => {
        const sourceIndex = slides.findIndex((item) => item.id === slide.id);
        const patch = (values: Partial<HeroSlide>) => { const next = clone(slides); next[sourceIndex] = { ...next[sourceIndex], ...values }; onChange(next); };
        return <section className="cms-card cms-form-grid" key={slide.id}>
          <div className="cms-card__heading wide"><h2>Slide {slide.sortOrder + 1}</h2><button className="danger" type="button" onClick={() => onChange(slides.filter((item) => item.id !== slide.id))}><Trash2 aria-hidden="true" /> Remove</button></div>
          <label><span>Eyebrow</span><input value={slide.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} /></label>
          <label><span>Order</span><input type="number" min={0} value={slide.sortOrder} onChange={(e) => patch({ sortOrder: Number(e.target.value) })} /></label>
          <label className="wide"><span>Title</span><input value={slide.title} onChange={(e) => patch({ title: e.target.value })} /></label>
          <label className="wide"><span>Description</span><textarea value={slide.description} onChange={(e) => patch({ description: e.target.value })} /></label>
          <label className="wide"><span>Image path or URL</span><input value={slide.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} /></label>
          <label><span>CTA label</span><input value={slide.primaryCtaLabel} onChange={(e) => patch({ primaryCtaLabel: e.target.value })} /></label>
          <label><span>CTA destination</span><input value={slide.primaryCtaHref} onChange={(e) => patch({ primaryCtaHref: e.target.value })} /></label>
          <label className="cms-check wide"><input type="checkbox" checked={slide.isActive} onChange={(e) => patch({ isActive: e.target.checked })} /><span>Slide is active</span></label>
        </section>;
      })}</div>
    </>
  );
}

function PagesEditor({ pages, onChange }: { pages: PageContent[]; onChange: (pages: PageContent[]) => void }) {
  const [slug, setSlug] = useState("home");
  const pageIndex = pages.findIndex((page) => page.slug === slug);
  const page = pages[pageIndex] ?? pages[0];
  const patchPage = (values: Partial<PageContent>) => { const next = clone(pages); next[pageIndex] = { ...next[pageIndex], ...values }; onChange(next); };
  return (
    <>
      <PanelHeading eyebrow="Structured content" title="Edit pages without a page builder." copy="Sections stay within the approved design system. Editors change content, order, links, images, and visibility without dragging arbitrary blocks." />
      <div className="cms-toolbar"><label><span>Page</span><select value={slug} onChange={(e) => setSlug(e.target.value)}>{pages.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label><button type="button" onClick={() => patchPage({ sections: [...page.sections, { id: crypto.randomUUID(), type: "rich_text", eyebrow: "", heading: "New section", body: "", imageUrl: "", ctaLabel: "", ctaHref: "", items: [], isVisible: true }] })}><Plus aria-hidden="true" /> Add section</button></div>
      <section className="cms-card cms-form-grid">
        <label><span>Page title</span><input value={page.title} onChange={(e) => patchPage({ title: e.target.value })} /></label>
        <label className="cms-check"><input type="checkbox" checked={page.isPublished} onChange={(e) => patchPage({ isPublished: e.target.checked })} /><span>Published</span></label>
        <label className="wide"><span>SEO description</span><textarea value={page.seoDescription} onChange={(e) => patchPage({ seoDescription: e.target.value })} /></label>
      </section>
      <div className="cms-stack">{page.sections.map((section, index) => (
        <section className="cms-card cms-form-grid" key={section.id}>
          <div className="cms-card__heading wide"><h2>Section {index + 1}</h2><button className="danger" type="button" onClick={() => patchPage({ sections: page.sections.filter((item) => item.id !== section.id) })}><Trash2 aria-hidden="true" /> Remove</button></div>
          <label><span>Section type</span><select value={section.type} onChange={(e) => { const next = clone(page.sections); next[index].type = e.target.value as typeof section.type; patchPage({ sections: next }); }}>{["intro", "features", "services", "projects", "statistics", "testimonial", "call_to_action", "rich_text"].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span>Eyebrow</span><input value={section.eyebrow} onChange={(e) => { const next = clone(page.sections); next[index].eyebrow = e.target.value; patchPage({ sections: next }); }} /></label>
          <label className="wide"><span>Heading</span><input value={section.heading} onChange={(e) => { const next = clone(page.sections); next[index].heading = e.target.value; patchPage({ sections: next }); }} /></label>
          <label className="wide"><span>Body</span><textarea value={section.body} onChange={(e) => { const next = clone(page.sections); next[index].body = e.target.value; patchPage({ sections: next }); }} /></label>
          <label className="wide"><span>Background image path or URL</span><input value={section.imageUrl} onChange={(e) => { const next = clone(page.sections); next[index].imageUrl = e.target.value; patchPage({ sections: next }); }} /></label>
          <label><span>CTA label</span><input value={section.ctaLabel} onChange={(e) => { const next = clone(page.sections); next[index].ctaLabel = e.target.value; patchPage({ sections: next }); }} /></label>
          <label><span>CTA destination</span><input value={section.ctaHref} onChange={(e) => { const next = clone(page.sections); next[index].ctaHref = e.target.value; patchPage({ sections: next }); }} /></label>
          <label className="cms-check wide"><input type="checkbox" checked={section.isVisible} onChange={(e) => { const next = clone(page.sections); next[index].isVisible = e.target.checked; patchPage({ sections: next }); }} /><span>Section is visible</span></label>
        </section>
      ))}</div>
    </>
  );
}

function FormsEditor({ forms, onChange }: { forms: FormDefinition[]; onChange: (forms: FormDefinition[]) => void }) {
  const [key, setKey] = useState("contact");
  const formIndex = forms.findIndex((form) => form.key === key);
  const form = forms[formIndex] ?? forms[0];
  const patch = (values: Partial<FormDefinition>) => { const next = clone(forms); next[formIndex] = { ...next[formIndex], ...values }; onChange(next); };
  return (
    <>
      <PanelHeading eyebrow="Form system" title="Control every form and field." copy="Edit labels, placeholders, required fields, select options, submit labels, success messages, and whether each form accepts submissions." />
      <div className="cms-toolbar"><label><span>Form</span><select value={key} onChange={(e) => setKey(e.target.value)}>{forms.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label></div>
      <section className="cms-card cms-form-grid">
        <label><span>Form name</span><input value={form.name} onChange={(e) => patch({ name: e.target.value })} /></label>
        <label><span>Submit button</span><input value={form.submitLabel} onChange={(e) => patch({ submitLabel: e.target.value })} /></label>
        <label className="wide"><span>Description</span><textarea value={form.description} onChange={(e) => patch({ description: e.target.value })} /></label>
        <label className="wide"><span>Success message</span><input value={form.successMessage} onChange={(e) => patch({ successMessage: e.target.value })} /></label>
        <label className="cms-check wide"><input type="checkbox" checked={form.isActive} onChange={(e) => patch({ isActive: e.target.checked })} /><span>Accept submissions</span></label>
      </section>
      <section className="cms-card">
        <h2>Fields</h2>
        <div className="cms-list-editor cms-list-editor--fields">{form.fields.map((field, index) => (
          <article key={field.id}>
            <span className="cms-list-editor__number">{index + 1}</span>
            <label><span>Label</span><input value={field.label} onChange={(e) => { const next = clone(form.fields); next[index].label = e.target.value; patch({ fields: next }); }} /></label>
            <label><span>Placeholder</span><input value={field.placeholder} onChange={(e) => { const next = clone(form.fields); next[index].placeholder = e.target.value; patch({ fields: next }); }} /></label>
            <label><span>Options (one per line)</span><textarea value={field.options.join("\n")} onChange={(e) => { const next = clone(form.fields); next[index].options = e.target.value.split("\n").map((value) => value.trim()).filter(Boolean); patch({ fields: next }); }} /></label>
            <label className="cms-check"><input type="checkbox" checked={field.isRequired} onChange={(e) => { const next = clone(form.fields); next[index].isRequired = e.target.checked; patch({ fields: next }); }} /><span>Required</span></label>
          </article>
        ))}</div>
      </section>
    </>
  );
}

function BookingsPanel({ bookings, setBookings }: { bookings: Booking[]; setBookings: (rows: Booking[]) => void }) {
  async function update(id: string, status: Booking["status"]) {
    const response = await fetch("/api/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) setBookings(bookings.map((row) => row.id === id ? { ...row, status } : row));
  }
  return <><PanelHeading eyebrow="Appointment management" title="Bookings." copy="Review the questionnaire, confirm appointments, and track the complete consultation workflow." /><section className="cms-card cms-table-wrap"><table><thead><tr><th>Client</th><th>Service</th><th>Date</th><th>Status</th></tr></thead><tbody>{bookings.map((row) => <tr key={row.id}><td><strong>{row.customerName}</strong><span>{row.customerEmail}</span></td><td>{row.service}</td><td>{new Date(row.startsAt).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Jamaica" })}</td><td><select value={row.status} onChange={(e) => update(row.id, e.target.value as Booking["status"])}>{["pending", "confirmed", "completed", "cancelled", "no_show"].map((value) => <option key={value}>{value}</option>)}</select></td></tr>)}</tbody></table>{bookings.length === 0 && <p className="cms-empty">No bookings yet.</p>}</section></>;
}

function InboxPanel({ submissions, setSubmissions }: { submissions: Submission[]; setSubmissions: (rows: Submission[]) => void }) {
  async function update(id: string, status: Submission["status"]) {
    const response = await fetch("/api/admin/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) setSubmissions(submissions.map((row) => row.id === id ? { ...row, status } : row));
  }
  return <><PanelHeading eyebrow="Unified inbox" title="Form submissions." copy="Contact messages, newsletter signups, and booking questionnaires are stored here with review and archive states." /><div className="cms-submissions">{submissions.map((row) => <article className="cms-card" key={row.id}><header><span>{row.formKey}</span><time>{new Date(row.createdAt).toLocaleString()}</time><select value={row.status} onChange={(e) => update(row.id, e.target.value as Submission["status"])}>{["new", "reviewed", "archived"].map((value) => <option key={value}>{value}</option>)}</select></header><dl>{Object.entries(row.payload).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl></article>)}</div>{submissions.length === 0 && <p className="cms-empty">No form submissions yet.</p>}</>;
}

function AvailabilityEditor({ cms, onChange }: { cms: CmsSnapshot; onChange: (cms: CmsSnapshot) => void }) {
  const availability = cms.availability;
  const update = (values: Partial<typeof availability>) => onChange({ ...cms, availability: { ...availability, ...values } });
  return <><PanelHeading eyebrow="Booking rules" title="Availability & scheduling." copy="Customers can request any future, unoccupied time, 24 hours a day and seven days a week." /><section className="cms-card cms-form-grid"><label><span>Time zone</span><input value={availability.timeZone} onChange={(e) => update({ timeZone: e.target.value })} /></label><label><span>Appointment duration (minutes)</span><input type="number" min={15} step={15} value={availability.slotMinutes} onChange={(e) => update({ slotMinutes: Number(e.target.value) })} /></label><p className="wide"><strong>Always available:</strong> midnight through 11:30 PM every day. Existing appointments and explicit booking blocks remain unavailable.</p></section></>;
}
