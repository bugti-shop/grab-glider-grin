import { test, expect } from "@playwright/test";

/** Seed N tasks directly into IndexedDB. */
async function seedTasks(page, count) {
  await page.addInitScript((n) => {
    const DB_NAME = "nota-tasks-db";
    const SETTINGS_DB_NAME = "nota-settings-db";
    const STORE = "tasks";
    const META = "meta";
    
    const open = () => new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 3);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const seedSettings = () => new Promise((resolve, reject) => {
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
    });

    (window as any).__seedPerfTasks = async () => {
      await seedSettings();
      const db = await open();
      const tx = (db as any).transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      s.clear();
      const today = new Date().toISOString();
      for (let i = 0; i < n; i++) {
        s.put({
          id: `perf-${i.toString().padStart(6, "0")}`,
          text: `Perf task ${i + 1}`,
          completed: false,
          createdAt: today,
          dueDate: today,
          order: i,
          sectionId: "today",
        });
      }
      return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
    };
  }, count);
}

test.describe("Touch Drag Regression @ 5k items", () => {
  test("completes 3-4 tasks then touch-drags across 5000 items", async ({ page }) => {
    const TASK_COUNT = 5000;
    await seedTasks(page, TASK_COUNT);
    
    // Setup
    await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => (window as any).__seedPerfTasks());
    await page.goto("/todo/today", { waitUntil: "networkidle" });
    
    const list = page.locator('[data-flowist-virtual-list="tasks"]');
    await expect(list).toBeVisible();
    
    const rows = page.locator('[data-flowist-virtual-list="tasks"] [data-index]');
    await expect(rows.first()).toBeVisible();

    // 1. Complete 4 tasks
    for (let i = 0; i < 4; i++) {
      const row = rows.nth(i);
      const box = await row.boundingBox();
      if (!box) throw new Error("Row box missing");
      // Tap the checkbox area (left side)
      await page.touchscreen.tap(box.x + 24, box.y + box.height / 2);
      // Wait for completion state or row to disappear/fade
      await page.waitForTimeout(100); 
    }

    // 2. Perform a touch-drag on one of the remaining items
    const source = rows.nth(10); // Grab something further down
    const target = rows.nth(5);
    const srcBox = await source.boundingBox();
    const tgtBox = await target.boundingBox();
    if (!srcBox || !tgtBox) throw new Error("Drag boxes missing");

    const x = srcBox.x + srcBox.width / 2;
    const y = srcBox.y + srcBox.height / 2;
    const ty = tgtBox.y + tgtBox.height / 2;

    await page.evaluate(({ x, y, ty }) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-index]') as HTMLElement;
      if (!el) return;
      
      const fire = (type: string, cx: number, cy: number) => {
        const touch = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy, radiusX: 2, radiusY: 2, force: 1 });
        el.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === "touchend" ? [] : [touch],
          targetTouches: type === "touchend" ? [] : [touch],
          changedTouches: [touch]
        }));
      };

      fire("touchstart", x, y);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          fire("touchmove", x, ty);
          setTimeout(() => {
            fire("touchend", x, ty);
            resolve();
          }, 50);
        }, 300); // Wait longer than the 250ms threshold to ensure it arms
      });
    }, { x, y, ty });

    // Verify reorder occurred via instrumentation
    const drop = await page.evaluate(() => (window as any).__flowistLastTaskDrop);
    expect(drop, "Drop instrumentation should be present").toBeDefined();
    expect(drop.from, "Dropped from correct source index").toBe(10);
    expect(drop.insertionIndex, "Dropped to correct target index").toBeLessThan(10);
  });
});
