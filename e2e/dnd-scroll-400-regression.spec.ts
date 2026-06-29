import { test, expect } from "@playwright/test";

/**
 * 400-item regression: imports 400 tasks, performs rapid wheel/touch
 * scrolling, executes a drag-reorder, and confirms drop accuracy + that
 * the page is still scrollable afterwards (no scroll-stuck state).
 */

async function seedTasks(page, count: number) {
  await page.addInitScript((n) => {
    const DB_NAME = "nota-tasks-db";
    const SETTINGS_DB_NAME = "nota-settings-db";
    const STORE = "tasks";

    const seedSettings = () => new Promise<void>((resolve) => {
      const req = indexedDB.open(SETTINGS_DB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("settings", "readwrite");
        const s = tx.objectStore("settings");
        s.put({ key: "onboarding_completed", value: true });
        s.put({ key: "todoViewMode", value: "flat" });
        s.put({ key: "todoShowCompleted", value: true });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("settings")) {
          req.result.createObjectStore("settings", { keyPath: "key" });
        }
      };
    });

    (window as any).__seedRegressionTasks = async () => {
      await seedSettings();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 3);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      s.clear();
      const today = new Date().toISOString();
      for (let i = 0; i < n; i++) {
        s.put({
          id: `reg-${i.toString().padStart(4, "0")}`,
          text: `Regression task ${i + 1}`,
          completed: false,
          createdAt: today,
          dueDate: today,
          order: i,
          sectionId: "today",
        });
      }
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    };
  }, count);
}

test.describe("400-item DnD + scroll regression", () => {
  test("drag accuracy holds after rapid scroll on 400 tasks", async ({ page }) => {
    test.setTimeout(90_000);
    await seedTasks(page, 400);
    await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => (window as any).__seedRegressionTasks());
    await page.goto("/todo/today", { waitUntil: "networkidle" });

    const list = page.locator('[data-flowist-virtual-list="tasks"]');
    await expect(list).toBeVisible();
    const rows = page.locator('[data-flowist-virtual-list="tasks"] [data-index]');
    await expect(rows.first()).toBeVisible();

    // Rapid wheel scroll down then back up — verifies no scroll-stuck state.
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, -800);
      await page.waitForTimeout(20);
    }
    // After scroll, the first row must be reachable again (proves scroll
    // recovered — the original "stuck" symptom).
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await expect(rows.first()).toBeVisible();

    // Drag reorder using hello-pangea path (400 < HELLO_PANGEA_CAP of 500).
    const source = rows.nth(3);
    const target = rows.nth(8);
    const srcBox = await source.boundingBox();
    const tgtBox = await target.boundingBox();
    if (!srcBox || !tgtBox) throw new Error("Drag boxes missing");

    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    // Move in a few steps so hello-pangea registers the drag.
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        srcBox.x + srcBox.width / 2,
        srcBox.y + srcBox.height / 2 + (tgtBox.y - srcBox.y) * t,
        { steps: 2 },
      );
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    const reorder = await page.evaluate(() => (window as any).__flowistLastTaskReorder);
    expect(reorder, "reorder instrumentation present").toBeTruthy();
    expect(reorder.ok, "reorder succeeded").toBe(true);
    expect(reorder.from).toBe(3);
    // Final destination must equal the visible blue-line slot (≈8, allow ±1
    // for hello-pangea's own midpoint snap).
    expect(Math.abs(reorder.to - 8)).toBeLessThanOrEqual(1);

    // Final sanity: page is still interactive after the drag — scroll once
    // more and confirm last row is reachable.
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(100);
    await expect(rows.last()).toBeVisible();
  });
});
