import { expect, test } from "@playwright/test";
import { courseCatalogueSchema, defaultCourseCatalogueSection, type CourseCatalogueRecord } from "../src/lib/course-catalogue";

const instructorId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`course catalogue CRUD and registration dialog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    let courses: CourseCatalogueRecord[] = []; let sequence = 0; let applications = 0;
    await page.route("**/api/admin/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/admin/images") return route.fulfill({ status: 201, json: { ok: true, data: { url: "/api/images/11111111-1111-4111-8111-111111111111.png" } } });
      if (new URL(route.request().url()).pathname === "/api/admin/course-catalogue") {
        if (route.request().method() === "GET") { await route.fulfill({ json: { ok: true, data: courses, categories: [{ id: categoryId, name: "Leadership" }], instructors: [{ id: instructorId, name: "Fixture Instructor" }] } }); return; }
        const input = route.request().postDataJSON();
        if (input.action === "delete") { courses = courses.filter((course) => course.id !== input.id); await route.fulfill({ json: { ok: true } }); return; }
        const previous = courses.find((course) => course.id === input.id);
        const data = input.action === "duplicate" ? { ...previous!, title: `${previous!.title} (copy)`, slug: `${previous!.slug}-copy`, status: "draft" as const } : courseCatalogueSchema.parse(input.data);
        const course = { ...data, id: input.action === "update" ? input.id : `33333333-3333-4333-8333-${String(++sequence).padStart(12, "0")}`, updatedAt: new Date().toISOString() };
        courses = [...courses.filter((item) => item.id !== course.id), course];
        await route.fulfill({ json: { ok: true, data: course } }); return;
      }
      await route.fulfill({ json: { ok: true, data: { courses, offerings: [], registrations: [], materials: [], recentActivity: [], metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 } } } });
    });
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Upcoming courses" }).click();
    await page.getByRole("button", { name: "Add New Course" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Course title", { exact: true }).fill("Practical Leadership");
    await dialog.getByLabel("URL slug", { exact: true }).fill("practical-leadership");
    await dialog.getByLabel("Subtitle", { exact: true }).fill("Develop confident teams");
    await dialog.getByLabel("Short summary", { exact: true }).fill("Build the practical skills to lead a capable team.");
    await dialog.getByLabel("Full description", { exact: true }).fill("Practical lessons for planning, communication and team leadership.");
    await dialog.getByRole("combobox", { name: "Publication status" }).selectOption("published");
    await dialog.getByRole("button", { name: "Save course", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("required before publication");
    await dialog.getByLabel("Banner image").setInputFiles({ name: "course.png", mimeType: "image/png", buffer: Buffer.from("fixture image") });
    await expect(dialog.getByText("Image uploaded. Save this form to use it.")).toBeVisible();
    await dialog.getByRole("combobox", { name: "Instructor", exact: true }).selectOption(instructorId);
    await dialog.getByRole("combobox", { name: "Category", exact: true }).selectOption(categoryId);
    await dialog.getByRole("combobox", { name: "Access type" }).selectOption("subscription");
    await dialog.getByLabel("Subscription information").fill("Annual access arranged offline.");
    await dialog.getByLabel("Course price", { exact: true }).fill("250");
    await dialog.getByLabel("Course price", { exact: true }).fill("");
    await expect(dialog.getByLabel("Course price", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "Save course", exact: true }).click();
    expect(courses).toHaveLength(0);
    await dialog.getByLabel("Course price", { exact: true }).fill("125.451");
    await dialog.getByRole("button", { name: "Save course", exact: true }).click();
    expect(courses).toHaveLength(0);
    await expect(dialog.getByLabel("Course price", { exact: true })).toHaveValue("125.451");
    await dialog.getByRole("combobox", { name: "Access type" }).selectOption("free");
    await expect(dialog.getByLabel("Course price", { exact: true })).toHaveValue("0");
    await expect(dialog.getByLabel("Course price", { exact: true })).toBeDisabled();
    await dialog.getByRole("combobox", { name: "Access type" }).selectOption("subscription");
    await expect(dialog.getByLabel("Subscription information")).toHaveValue("Annual access arranged offline.");
    await dialog.getByLabel("Course price", { exact: true }).fill("125.45");
    await dialog.getByRole("combobox", { name: "Currency", exact: true }).selectOption("USD");
    await dialog.getByLabel("Enrolment limit").fill("25");
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await dialog.getByRole("button", { name: "Save course", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width === 320 || width === 1440) { await dialog.evaluate((element) => { element.scrollTop = 0; }); await dialog.screenshot({ path: `test-results/course-editor-${width}.png` }); }
    await dialog.getByRole("button", { name: "Save course", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "View Practical Leadership", exact: true }).click();
    await expect(dialog.getByLabel("Course title", { exact: true })).toHaveValue("Practical Leadership");
    await expect(dialog.getByLabel("Course title", { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel("Course price", { exact: true })).toHaveValue("125.45");
    await expect(dialog.getByRole("combobox", { name: "Currency", exact: true })).toHaveValue("USD");
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Edit Practical Leadership", exact: true }).click();
    await dialog.getByLabel("Subtitle", { exact: true }).fill("Unsaved text");
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await dialog.getByRole("button", { name: "Close course dialog" }).click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await page.getByRole("button", { name: "Duplicate Practical Leadership", exact: true }).click();
    await page.getByRole("button", { name: "Delete Practical Leadership (copy)", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await expect(page.getByRole("button", { name: "View Practical Leadership (copy)", exact: true })).toHaveCount(0);
    await page.route("**/api/course-catalogue", (route) => route.fulfill({ json: { ok: true, data: courses.filter((course) => course.status === "published") } }));
    await page.route("**/api/courses", async (route) => {
      if (route.request().method() === "POST") { applications++; await route.fulfill({ status: 201, json: { ok: true } }); return; }
      await route.fulfill({ json: { ok: true, data: [{ id: instructorId, courseId: courses[0].id, title: courses[0].title, code: "LEAD-1", startsAt: "2097-09-04T14:00:00Z", timeZone: "America/Jamaica", deliveryMode: "virtual", feeCents: 25045, currency: "JMD", capacity: 25, approvedSeats: 0 }] } });
    });
    await page.goto("/programmes");
    const card = page.locator(".course-catalogue-card").filter({ has: page.getByRole("heading", { name: "Practical Leadership", exact: true }) });
    await card.getByText("View course details", { exact: true }).click();
    await expect(card.getByText("Subscription: Annual access arranged offline.", { exact: true })).toBeVisible();
    await expect(card).toContainText("JMD 250.45 · offline payment arrangements");
    const register = page.getByRole("button", { name: "Register for Practical Leadership" });
    await expect(register).toBeVisible(); await register.click();
    await expect(dialog).toBeVisible(); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await expect(register).toBeFocused(); await register.click();
    const contact = dialog.getByRole("group", { name: "Primary contact" });
    await contact.getByLabel("Name", { exact: true }).fill("Test Student"); await contact.getByLabel("Email", { exact: true }).fill("student@example.test");
    const participants = dialog.getByRole("group", { name: "Participants" });
    await participants.getByLabel("Name", { exact: true }).fill("Test Student"); await participants.getByLabel("Email", { exact: true }).fill("student@example.test");
    await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Submit registration" }).click();
    await expect(dialog.getByRole("status")).toContainText("Registration received");
    await expect(dialog.getByRole("button", { name: "Submit registration" })).toBeDisabled();
    expect(applications).toBe(1); expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Close registration" }).click();
    if (width === 320 || width === 1440) await page.locator(".course-catalogue-grid--public").screenshot({ path: `test-results/course-public-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test("non-subscription courses do not advertise retained subscription notes", async ({ page }) => {
  await page.route("**/api/course-catalogue", (route) => route.fulfill({ json: { ok: true, data: [{
    id: instructorId, title: "Free resource course", slug: "free-resource-course", subtitle: "Free learning resources",
    summary: "Access to practical resources.", description: "A course with previous subscription notes retained in its editor.",
    bannerUrl: "", category: null, instructor: null, skillLevel: "all_levels", accessType: "free", priceCents: 0, currency: "JMD",
    subscription: "Old annual subscription terms",
  }] } }));
  await page.route("**/api/courses", (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.goto("/programmes");
  const card = page.locator(".course-catalogue-card").filter({ has: page.getByRole("heading", { name: "Free resource course", exact: true }) });
  await card.getByText("View course details", { exact: true }).click();
  await expect(card).not.toContainText("Old annual subscription terms");
  await expect(card.getByRole("button", { name: "Registration not open" })).toBeDisabled();
});

test("admin places a publishable one-row catalogue on any website page with view, share and register actions", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  let section = { ...defaultCourseCatalogueSection, updatedAt: null as string | null };
  const cards = Array.from({ length: 4 }, (_, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
    title: `Catalogue course ${index + 1}`, slug: `catalogue-course-${index + 1}`, subtitle: "Practical learning",
    summary: "Build practical skills with guided course materials.", description: "A complete course description for prospective students.",
    bannerUrl: "/images/home-hero-background-4.png", category: "Leadership", instructor: "Fixture Instructor",
    skillLevel: "all_levels", accessType: "free" as const, priceCents: 0, currency: "JMD", subscription: "",
  }));
  await page.route("**/api/admin/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/admin/images") return route.fulfill({ status: 201, json: { ok: true, data: { url: "/api/images/22222222-2222-4222-8222-222222222222.webp" } } });
    if (new URL(route.request().url()).pathname === "/api/admin/course-catalogue") {
      if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, data: [], categories: [], instructors: [], section } });
      const input = route.request().postDataJSON();
      if (input.action === "section") {
        section = { ...input.data, updatedAt: new Date().toISOString() };
        return route.fulfill({ json: { ok: true, data: section } });
      }
    }
    return route.fulfill({ json: { ok: true, data: { courses: [], offerings: [], registrations: [], materials: [], recentActivity: [], metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 } } } });
  });
  await page.goto("/admin/courses");
  await page.getByRole("button", { name: "Upcoming courses" }).click();
  const settings = page.getByRole("region", { name: "Published catalogue section" });
  await expect(settings.getByRole("switch", { name: "Publish catalogue section" })).toBeChecked();
  await settings.getByLabel("Website page").selectOption("home");
  await settings.getByLabel("Background style").selectOption("image");
  await settings.getByLabel("Background image", { exact: true }).setInputFiles({ name: "background.webp", mimeType: "image/webp", buffer: Buffer.from("fixture image") });
  await expect(settings.getByText("Image uploaded. Save this form to use it.")).toBeVisible();
  await settings.getByRole("button", { name: "Save catalogue section" }).click();
  await expect(settings.getByText("Catalogue section saved and the website updated.", { exact: true })).toBeVisible();

  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => sessionStorage.setItem("shared-course-url", String(data.url)) }));
  await page.route("**/api/course-catalogue", (route) => route.fulfill({ json: { ok: true, data: cards, section } }));
  await page.route("**/api/courses", (route) => route.fulfill({ json: { ok: true, data: [{ id: instructorId, courseId: cards[0].id, title: cards[0].title, summary: cards[0].summary, code: "CAT-1", startsAt: "2097-09-04T14:00:00Z", endsAt: "2097-09-04T16:00:00Z", timeZone: "America/Jamaica", deliveryMode: "virtual", venue: null, feeCents: 0, currency: "JMD", capacityMode: "unlimited", capacity: null, approvedSeats: 0, registrationClosesAt: null }] } }));
  await page.goto("/");
  const published = page.getByRole("region", { name: "Published course catalogue" });
  await expect(published).toBeVisible();
  await expect(published).toHaveCSS("background-image", /22222222-2222-4222-8222-222222222222\.webp/);
  const row = published.getByRole("list", { name: "Published courses" });
  expect(await row.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(published.getByRole("button", { name: "Previous courses" })).toBeVisible();
  await published.getByRole("button", { name: "Next courses" }).click();
  await published.getByText("View course details", { exact: true }).first().click();
  await expect(published.getByText("A complete course description for prospective students.", { exact: true }).first()).toBeVisible();
  await published.getByRole("button", { name: "Share Catalogue course 1" }).click();
  await expect(published.getByRole("status")).toContainText("Course link shared");
  expect(await page.evaluate(() => sessionStorage.getItem("shared-course-url"))).toContain("/#course-catalogue-course-1");
  await expect(published.getByRole("button", { name: "Register for Catalogue course 1" })).toBeVisible();
  await page.goto("/programmes");
  await expect(page.getByRole("region", { name: "Published course catalogue" })).toHaveCount(0);
});
