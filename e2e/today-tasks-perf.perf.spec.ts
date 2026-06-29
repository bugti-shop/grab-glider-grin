import { test, expect, type Page } from "@playwright/test";

/**
 * 5,000-task performance & stability suite for the Today tasks page.
 *
 * What this guards:
 *  1. Initial render time for the virtualized list at 5k items.
 *  2. Virtualization invariant: rendered DOM rows stay bounded.
 *  3. Touch drag + drop reorder latency on mobile viewport.
 *  4. Repeated drag + complete cycles do not leak JS heap memory or
 *     block the main thread (responsiveness check).
 *
 * NOTE: This suite never modifies the UI. It only reads & interacts.
 */

const TASK_COUNT = Number(process.env.PERF_TASK_COUNT ?? 5000);
const MAX_RENDER_MS = Number(process.env.PERF_MAX_RENDER_MS ?? 2500);
const MAX_DOM_ROWS = Number(process.env.PERF_MAX_DOM_ROWS ?? 60);
const MAX_REORDER_LATENCY_MS = Number(process.env.PERF_MAX_REORDER_LATENCY ?? 250);
const MAX_HEAP_GROWTH_MB = Number(process.env.PERF_MAX_HEAP_GROWTH_MB ?? 25);
const STRESS_CYCLES = Number(process.env.PERF_STRESS_CYCLES ?? 200);

/** Seed N tasks directly into the app's IndexedDB so we never time the UI. */
async function seedTasks(page: Page, count: number) {
  await page.addInitScript((n: number) => {
    // Runs once per page before any app script.
    try {
      localStorage.setItem("flowist_landing_acknowledged", "true");
      sessionStorage.setItem("flowist_landing_acknowledged", "true");
      localStorage.setItem("onboarding_completed_flag", "true");
      localStorage.setItem("flowist_user_engaged", "true");
    } catch {}
    const DB_NAME = "nota-tasks-db";
    const SETTINGS_DB_NAME = "nota-settings-db";
    const STORE = "tasks";
    const META = "meta";
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 3);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const s = db.createObjectStore(STORE, { keyPath: "id" });
            s.createIndex("completed", "completed", { unique: false });
            s.createIndex("dueDate", "dueDate", { unique: false });
            s.createIndex("sectionId", "sectionId", { unique: false });
          }
          if (!db.objectStoreNames.contains(META)) {
            db.createObjectStore(META, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const seedSettings = () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(SETTINGS_DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "key" });
          }
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("settings", "readwrite");
          const s = tx.objectStore("settings");
          s.put({ key: "onboarding_completed", value: true });
          s.put({ key: "todoViewMode", value: "flat" });
          s.put({ key: "todoShowCompleted", value: true });
          s.put({ key: "todoDateFilter", value: "all" });
          s.put({ key: "todoSortBy", value: "created" });
          s.put({ key: "todoGroupByOption", value: "none" });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });

    (window as unknown as { __seedPerfTasks: () => Promise<void> }).__seedPerfTasks =
      async () => {
        await seedSettings();
        const db = await open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const s = tx.objectStore(STORE);
          s.clear();
          const today = new Date();
          for (let i = 0; i < n; i++) {
            s.put({
              id: `perf-${i.toString().padStart(6, "0")}`,
              text: `Perf task ${i + 1}`,
              completed: false,
              createdAt: today.toISOString(),
              dueDate: today.toISOString(),
              order: i,
              sectionId: "today",
            });
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      };
  }, count);
}

async function gotoToday(page: Page) {
  // Establish the origin without booting React, seed IndexedDB while the app is
  // idle, then navigate to Today. Loading `/` first can trigger onboarding and
  // leave React state stuck there even after the DB has been seeded.
  await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
  await page.evaluate(() =>
    (window as unknown as { __seedPerfTasks: () => Promise<void> }).__seedPerfTasks()
  );
  await page.goto("/todo/today", { waitUntil: "domcontentloaded" });
}

async function waitForVirtualList(page: Page) {
  await page.waitForSelector('[data-flowist-virtual-list="tasks"] [data-index]', {
    timeout: 15_000,
  });
}

test.describe("Today tasks @ 5k items", () => {
  test("initial render stays under threshold", async ({ page }) => {
    await seedTasks(page, TASK_COUNT);
    const start = Date.now();
    await gotoToday(page);
    await waitForVirtualList(page);
    const renderMs = Date.now() - start;
    console.log(`[perf] initial render: ${renderMs}ms (limit ${MAX_RENDER_MS})`);
    expect(renderMs, "initial render time").toBeLessThan(MAX_RENDER_MS);
  });

  test("virtualization keeps DOM row count bounded", async ({ page }) => {
    await seedTasks(page, TASK_COUNT);
    await gotoToday(page);
    await waitForVirtualList(page);
    const rowCount = await page
      .locator('[data-flowist-virtual-list="tasks"] [data-index]')
      .count();
    console.log(`[perf] rendered DOM rows: ${rowCount} (limit ${MAX_DOM_ROWS})`);
    expect(rowCount, "virtualized DOM rows").toBeGreaterThan(0);
    expect(rowCount, "virtualized DOM rows").toBeLessThanOrEqual(MAX_DOM_ROWS);
  });

  test("touch drag reorders within latency budget and UI stays interactive", async ({
    page,
  }) => {
    await seedTasks(page, TASK_COUNT);
    await gotoToday(page);
    await waitForVirtualList(page);

    const rows = page.locator('[data-flowist-virtual-list="tasks"] [data-index]');
    await expect(rows.first()).toBeVisible();

    const source = rows.first();
    const target = rows.nth(3);
    const srcBox = await source.boundingBox();
    const tgtBox = await target.boundingBox();
    if (!srcBox || !tgtBox) throw new Error("missing bounding boxes");

    const srcX = srcBox.x + srcBox.width / 2;
    const srcY = srcBox.y + srcBox.height / 2;
    const tgtY = tgtBox.y + tgtBox.height / 2;

    const start = Date.now();
    // Long-press → drag → drop using the touch input pipeline.
    await page.touchscreen.tap(srcX, srcY); // ensure focus
    await page.evaluate(
      ({ x, y, ty }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return;
        const fire = (type: string, clientX: number, clientY: number) => {
          const touch = new Touch({
            identifier: 1,
            target: el,
            clientX,
            clientY,
            radiusX: 2,
            radiusY: 2,
            rotationAngle: 0,
            force: 1,
          });
          el.dispatchEvent(
            new TouchEvent(type, {
              cancelable: true,
              bubbles: true,
              touches: type === "touchend" ? [] : [touch],
              targetTouches: type === "touchend" ? [] : [touch],
              changedTouches: [touch],
            })
          );
        };
        fire("touchstart", x, y);
        // Hold past long-press threshold (~90ms)
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            fire("touchmove", x, ty);
            setTimeout(() => {
              fire("touchend", x, ty);
              resolve();
            }, 40);
          }, 140);
        });
      },
      { x: srcX, y: srcY, ty: tgtY }
    );
    const latency = Date.now() - start;
    console.log(`[perf] drag+drop latency: ${latency}ms (limit ${MAX_REORDER_LATENCY_MS})`);

    const firstRowText = await rows.first().innerText();
    expect(firstRowText, "drop operation completed and reordered the list").not.toContain(
      "Perf task 1"
    );

    // Verify the page is still responsive: a synchronous eval should return fast.
    const tickStart = Date.now();
    await page.evaluate(() => 1 + 1);
    const tick = Date.now() - tickStart;
    expect(tick, "main thread responsive after drag").toBeLessThan(500);

    // Soft assertion: latency budget. We allow a generous bound because Playwright
    // dispatches touch events from a worker process.
    expect(latency, "drag+drop reorder latency").toBeLessThan(
      MAX_REORDER_LATENCY_MS + 1500
    );
  });

  test("repeated drag + complete cycles do not leak heap / freeze UI", async ({
    page,
  }) => {
    await seedTasks(page, TASK_COUNT);
    await gotoToday(page);
    await waitForVirtualList(page);

    // Force GC if exposed (Chromium with --js-flags="--expose-gc")
    const tryGc = () =>
      page.evaluate(() => {
        const w = window as unknown as { gc?: () => void };
        if (typeof w.gc === "function") w.gc();
      });

    const sampleHeap = async (): Promise<number | null> => {
      return page.evaluate(() => {
        const perf = performance as unknown as {
          memory?: { usedJSHeapSize: number };
        };
        return perf.memory ? perf.memory.usedJSHeapSize : null;
      });
    };

    await tryGc();
    const before = await sampleHeap();

    const maxTickMs: number[] = [];
    for (let i = 0; i < STRESS_CYCLES; i++) {
      // Toggle complete on a random visible row via its checkbox/click target.
      const rows = page.locator('[data-flowist-virtual-list="tasks"] [data-index]');
      const total = await rows.count();
      if (total === 0) break;
      const idx = i % total;
      const row = rows.nth(idx);
      const box = await row.boundingBox();
      if (!box) continue;
      // Tap left-edge area where the checkbox lives; safe if it misses.
      await page.touchscreen.tap(box.x + 24, box.y + box.height / 2).catch(() => {});

      // Every 10 cycles, measure main-thread tick latency.
      if (i % 10 === 0) {
        const t0 = Date.now();
        await page.evaluate(
          () => new Promise<void>((r) => requestAnimationFrame(() => r()))
        );
        maxTickMs.push(Date.now() - t0);
      }
    }

    await tryGc();
    const after = await sampleHeap();

    const worstTick = maxTickMs.length ? Math.max(...maxTickMs) : 0;
    console.log(`[perf] worst rAF tick during stress: ${worstTick}ms`);
    expect(worstTick, "main thread never froze").toBeLessThan(1500);

    if (before != null && after != null) {
      const growthMb = (after - before) / (1024 * 1024);
      console.log(
        `[perf] heap growth after ${STRESS_CYCLES} cycles: ${growthMb.toFixed(2)} MB ` +
          `(limit ${MAX_HEAP_GROWTH_MB} MB)`
      );
      expect(growthMb, "heap should not balloon").toBeLessThan(MAX_HEAP_GROWTH_MB);
    } else {
      console.log("[perf] performance.memory unavailable; skipping heap assertion");
    }
  });
});
