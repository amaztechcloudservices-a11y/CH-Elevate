"use client";

import { ChevronLeft, ChevronRight, Eye, Share2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/courses";

export type CourseOffering = { id: string; courseId: string; title: string; summary: string; code: string; startsAt: string; endsAt: string; timeZone: string; deliveryMode: "in_person" | "virtual" | "blended"; venue: string | null; feeCents: number; currency: string; capacityMode: "unlimited" | "soft" | "hard"; capacity: number | null; approvedSeats: number; registrationClosesAt: string | null };
export type CourseCatalogueCard = { id: string; title: string; slug: string; subtitle: string; summary: string; description: string; bannerUrl: string; category: string | null; instructor: string | null; skillLevel: string; accessType: "free" | "one_time" | "subscription" | "private"; priceCents: number; currency: string; subscription: string };

export function CoursePublicCatalogue({ cards, offerings, onRegister }: { cards: CourseCatalogueCard[]; offerings: CourseOffering[]; onRegister: (offering: CourseOffering) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ start: true, end: false });
  const [shareStatus, setShareStatus] = useState("");
  const updatePosition = useCallback(() => {
    const row = rowRef.current; if (!row) return;
    setPosition({ start: row.scrollLeft <= 2, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    updatePosition(); window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [cards.length, updatePosition]);
  function move(direction: -1 | 1) {
    const row = rowRef.current; if (!row) return;
    row.scrollBy({ left: direction * Math.max(280, row.clientWidth * .82), behavior: "smooth" });
  }
  async function share(course: CourseCatalogueCard) {
    const url = new URL(window.location.href); url.hash = `course-${course.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: course.title, text: course.summary, url: url.toString() });
      else if (navigator.clipboard) await navigator.clipboard.writeText(url.toString());
      else throw new Error("Sharing is unavailable");
      setShareStatus(`Course link shared for ${course.title}.`);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setShareStatus(`The course link could not be shared. Copy it from the address bar: ${url}`);
    }
  }
  if (!cards.length) return <div className="course-registration__empty"><h3>No courses are published yet.</h3><p><Link href="/contact">Contact us</Link> to discuss private or future cohorts.</p></div>;
  return <div className="course-catalogue-carousel">
    <div className="course-catalogue-carousel__controls" aria-label="Course catalogue controls">
      <p>{cards.length} {cards.length === 1 ? "course" : "courses"}</p>
      <div><button type="button" aria-label="Previous courses" disabled={position.start} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button><button type="button" aria-label="Next courses" disabled={position.end} onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button></div>
    </div>
    <div ref={rowRef} className="course-catalogue-grid course-catalogue-grid--public" role="list" aria-label="Published courses" tabIndex={0} onScroll={updatePosition}>
      {cards.map((course) => <CourseCard key={course.id} course={course} offerings={offerings.filter((offering) => offering.courseId === course.id)} onRegister={onRegister} onShare={share} />)}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{shareStatus}</p>
  </div>;
}

function CourseCard({ course, offerings, onRegister, onShare }: { course: CourseCatalogueCard; offerings: CourseOffering[]; onRegister: (offering: CourseOffering) => void; onShare: (course: CourseCatalogueCard) => void }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = offerings.find((offering) => offering.id === selectedId) || offerings[0];
  return <article className="course-catalogue-card" id={`course-${course.slug}`} role="listitem">
    {course.bannerUrl && <Image src={course.bannerUrl} alt="" width={720} height={405} unoptimized />}
    <div className="course-catalogue-card__body">
      {course.category && <small>{course.category}</small>}<h3>{course.title}</h3>{course.subtitle && <p className="course-catalogue-subtitle">{course.subtitle}</p>}<p>{course.summary}</p>
      <details><summary><Eye aria-hidden="true" /> View course details</summary><p className="course-catalogue-description">{course.description}</p>{course.instructor && <p>Instructor: {course.instructor}</p>}<p>Level: {course.skillLevel.replaceAll("_", " ")}</p>{course.accessType === "subscription" && course.subscription && <p>Subscription: {course.subscription}</p>}</details>
      {selected ? <><label><span>Available date</span><select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{offerings.map((offering) => <option key={offering.id} value={offering.id}>{new Date(offering.startsAt).toLocaleDateString("en-JM", { dateStyle: "medium", timeZone: offering.timeZone })} · {offering.code}</option>)}</select></label>
        <p>{selected.deliveryMode.replaceAll("_", " ")}{selected.venue ? ` · ${selected.venue}` : ""}</p><p>{formatMoney(selected.feeCents, selected.currency)} · offline payment arrangements</p>
        {selected.capacity !== null && <p>{Math.max(0, selected.capacity - selected.approvedSeats)} seats remaining{selected.approvedSeats >= selected.capacity ? " · waitlist or approval required" : ""}</p>}
        <button className="ref-button" type="button" onClick={() => onRegister(selected)}>Register for {course.title}</button></> : <><button className="ref-button" type="button" disabled>Registration not open</button><Link href="/contact">Ask about the next cohort</Link></>}
      <button className="course-catalogue-share" type="button" aria-label={`Share ${course.title}`} onClick={() => onShare(course)}><Share2 aria-hidden="true" /> Share course</button>
    </div>
  </article>;
}
