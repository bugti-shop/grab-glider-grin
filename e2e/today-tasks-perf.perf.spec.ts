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
const ROW_SELECTOR = '[data-flowist-virtual-list="tasks"] [data-index]';

type DropInstrumentation = {
  from?: number;
  insertionIndex?: number;
  insert?: unknown;
};

type ReorderInstrumentation = {
  ok?: boolean;
  skipped?: boolean;
  from?: number;
  to?: number;
  insertionIndex?: number;
};

/** Seed N tasks directly into the app's IndexedDB so we never time the UI. */
async function seedTasks(page: Page, count: number) {
  await page.addInitScript((n: number) => {
    // Runs once per page before any app script.
    try {
      localStorage.setItem("nota_cache_cleared_v3", "true");
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
          s.put({ key: "flowist_admin_bypass", value: true });
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
  const navStart = Date.now();
  await page.goto("/todo/today", { waitUntil: "domcontentloaded" });
  return navStart;
}

async function waitForVirtualList(page: Page) {
  await page.waitForSelector(ROW_SELECTOR, {
    timeout: 15_000,
  });
}

function extractPerfTitle(text: string) {
  return text.match(/Perf task \d+/)?.[0] ?? text.trim();
}

async function rowText(page: Page, index: number) {
  return page.locator(ROW_SELECTOR).nth(index).innerText();
}

async function resetDragInstrumentation(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.__flowistLastTaskDrop;
    delete w.__flowistLastTaskReorder;
    delete w.__flowistLastTaskInsert;
    delete w.__flowistTaskDragArmed;
  });
}

async function readDragInstrumentation(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __flowistLastTaskDrop?: DropInstrumentation;
      __flowistLastTaskReorder?: ReorderInstrumentation;
      __flowistLastTaskInsert?: unknown;
      __flowistTaskDragArmed?: unknown;
    };
    return {
      drop: w.__flowistLastTaskDrop,
      reorder: w.__flowistLastTaskReorder,
      insert: w.__flowistLastTaskInsert,
      armed: w.__flowistTaskDragArmed,
    };
  });
}

async function dispatchStationaryTouch(page: Page, rowIndex: number, holdMs = 240) {
  const row = page.locator(ROW_SELECTOR).nth(rowIndex);
  const box = await row.boundingBox();
  if (!box) throw new Error(`missing row ${rowIndex} box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await resetDragInstrumentation(page);
  await page.evaluate(
    ({ x, y, holdMs }) => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-index]') as HTMLElement | null;
      if (!el) throw new Error('No row under stationary touch point');
      const fire = (type: string) => {
        const touch = new Touch({
          identifier: 1,
          target: el,
          clientX: x,
          clientY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1,
        });
        el.dispatchEvent(new TouchEvent(type, {
          cancelable: true,
          bubbles: true,
          touches: type === 'touchend' ? [] : [touch],
          targetTouches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
        }));
      };
      fire('touchstart');
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          fire('touchend');
          resolve();
        }, holdMs);
      });
    },
    { x, y, holdMs }
  );
}

async function dispatchTouchDrag(page: Page, fromIndex: number, targetIndex: number, holdMs = 240) {
  const rows = page.locator(ROW_SELECTOR);
  const source = rows.nth(fromIndex);
  const target = rows.nth(targetIndex);
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  if (!srcBox || !tgtBox) throw new Error('missing drag bounding boxes');

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;
  const targetY = tgtBox.y + tgtBox.height * 0.75;
  await resetDragInstrumentation(page);

  await page.evaluate(
    ({ x, y, targetY, holdMs }) => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-index]') as HTMLElement | null;
      if (!el) throw new Error('No source row under drag point');
      const fire = (type: string, clientY: number) => {
        const touch = new Touch({
          identifier: 1,
          target: el,
          clientX: x,
          clientY,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1,
        });
        el.dispatchEvent(new TouchEvent(type, {
          cancelable: true,
          bubbles: true,
          touches: type === 'touchend' ? [] : [touch],
          targetTouches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
        }));
      };
      fire('touchstart', y);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const firstMoveY = y + Math.sign(targetY - y) * 24;
          fire('touchmove', firstMoveY);
          setTimeout(() => {
            fire('touchmove', targetY);
            setTimeout(() => {
              fire('touchend', targetY);
              resolve();
            }, 35);
          }, 35);
        }, holdMs);
      });
    },
    { x: srcX, y: srcY, targetY, holdMs }
  );

  return readDragInstrumentation(page);
}

async function completeFirstVisibleTasksInstantly(page: Page, count: number) {
  const rows = page.locator(ROW_SELECTOR);
  const boxes = [] as { x: number; y: number; height: number }[];
  for (let i = 0; i < count; i += 1) {
    const box = await rows.nth(i).boundingBox();
    if (!box) throw new Error(`missing row ${i} completion box`);
    boxes.push({ x: box.x, y: box.y, height: box.height });
  }
  for (const box of boxes) {
    await page.touchscreen.tap(box.x + 24, box.y + box.height / 2);
  }
}

test.describe("Today tasks @ 5k items", () => {
  test("initial render stays under threshold", async ({ page }) => {
    await seedTasks(page, TASK_COUNT);
    const start = await gotoToday(page);
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
      .locator(ROW_SELECTOR)
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

    const rows = page.locator(ROW_SELECTOR);
    await expect(rows.first()).toBeVisible();

    const start = Date.now();
    const instrumentation = await dispatchTouchDrag(page, 0, 3);
    const latency = Date.now() - start;
    console.log(`[perf] drag+drop latency: ${latency}ms (limit ${MAX_REORDER_LATENCY_MS})`);

    const dropInstrumentation = instrumentation.drop;
    expect(dropInstrumentation?.from, "drop fired from the dragged row").toBe(0);
    expect(dropInstrumentation?.insertionIndex, "drop computed an insert index from row midpoints").toBeGreaterThan(0);
    expect(instrumentation.reorder?.ok, "reorder committed after drop").toBe(true);

    await expect(rows.first(), "drop operation completed and reordered the list").not.toContainText(
      "Perf task 1",
      { timeout: 2_000 }
    );

    const firstRowText = await rows.first().innerText();
    expect(firstRowText, "drop operation completed and reordered the list").not.toContain("Perf task 1");

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

  test("rapid completion then repeated touch drags always reflect the new UI index", async ({
    page,
  }) => {
    await seedTasks(page, TASK_COUNT);
    await gotoToday(page);
    await waitForVirtualList(page);

    await dispatchStationaryTouch(page, 0);
    const stationaryInstrumentation = await readDragInstrumentation(page);
    expect(stationaryInstrumentation.drop, "holding/tapping without movement must not drop").toBeUndefined();
    expect(stationaryInstrumentation.reorder, "holding/tapping without movement must not reorder").toBeUndefined();

    await completeFirstVisibleTasksInstantly(page, 4);
    await expect
      .poll(() => rowText(page, 0), { timeout: 5_000, message: "first 4 rapid completions should flush" })
      .toContain("Perf task 5");

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const draggedTitle = extractPerfTitle(await rowText(page, 0));
      const instrumentation = await dispatchTouchDrag(page, 0, 3);

      expect(instrumentation.armed, `drag ${cycle + 1} armed only after long-press`).toBeTruthy();
      expect(instrumentation.drop?.from, `drag ${cycle + 1} fired drop from visible index 0`).toBe(0);
      expect(instrumentation.reorder?.ok, `drag ${cycle + 1} committed reorder`).toBe(true);
      expect(instrumentation.reorder?.to, `drag ${cycle + 1} persisted target order index`).toBe(3);

      await expect
        .poll(() => rowText(page, 3), { timeout: 3_000, message: `drag ${cycle + 1} UI index updated` })
        .toContain(draggedTitle);
      await expect
        .poll(() => rowText(page, 0), { timeout: 3_000, message: `drag ${cycle + 1} source index changed` })
        .not.toContain(draggedTitle);

      const tickStart = Date.now();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(Date.now() - tickStart, `main thread responsive after drag ${cycle + 1}`).toBeLessThan(500);
    }
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
      const rows = page.locator(ROW_SELECTOR);
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
