import { useCallback, useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { TaskInputSheet } from "@/components/TaskInputSheet";
import { getSetting } from "@/utils/settingsStorage";
import { saveTodoItem } from "@/utils/todoItemsStorage";
import { genId } from "@/utils/genId";
import { TodoItem, Folder, TaskSection } from "@/types/note";
import { toast } from "sonner";

// Native bridge exposed by QuickAddOverlayActivity/QuickAddOverlayPlugin.
// On web / iOS (no plugin registered) close() is a no-op — we fall back to
// closing the sheet in-page.
interface QuickAddOverlayPlugin {
  close(): Promise<{ ok: boolean }>;
}
const QuickAddOverlay = registerPlugin<QuickAddOverlayPlugin>("QuickAddOverlay");

/**
 * Lightweight route rendered inside the translucent Android overlay Activity.
 *
 * Mounts the REAL <TaskInputSheet/> the in-app flow uses, wired to the same
 * providers (Subscription, i18n, GlobalTags) already installed by App.tsx and
 * to the same task-persistence layer (loadTodoItems / saveTodoItems).
 *
 * The page background is transparent so the native activity's dim scrim
 * shows through behind the sheet.
 */
const QuickAdd = () => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sections] = useState<TaskSection[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const f = await getSetting<Folder[]>("todoFolders", []);
        if (Array.isArray(f)) setFolders(f);
      } catch {}
    })();
  }, []);

  // Make the WebView + document transparent so the launcher shows through
  // behind the sheet (fixes the white background on Android overlay).
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      rootBg: root?.style.background ?? "",
      htmlColor: (html.style as CSSStyleDeclaration).backgroundColor,
      bodyColor: (body.style as CSSStyleDeclaration).backgroundColor,
    };
    html.style.background = "transparent";
    body.style.background = "transparent";
    (html.style as CSSStyleDeclaration).backgroundColor = "transparent";
    (body.style as CSSStyleDeclaration).backgroundColor = "transparent";
    if (root) root.style.background = "transparent";
    document.body.classList.add("quick-add-overlay");
    return () => {
      html.style.background = prev.htmlBg;
      body.style.background = prev.bodyBg;
      (html.style as CSSStyleDeclaration).backgroundColor = prev.htmlColor;
      (body.style as CSSStyleDeclaration).backgroundColor = prev.bodyColor;
      if (root) root.style.background = prev.rootBg;
      document.body.classList.remove("quick-add-overlay");
    };
  }, []);

  const closeOverlay = useCallback(() => {
    setIsOpen(false);
    if (Capacitor.isNativePlatform()) {
      QuickAddOverlay.close().catch(() => {});
    }
  }, []);

  const handleAddTask = useCallback(
    async (task: Omit<TodoItem, "id" | "completed">) => {
      try {
        const newItem: TodoItem = { id: genId(), completed: false, ...task };
        // Use per-item put (NOT full-list replace) so we never clobber tasks
        // already in the main-app IndexedDB from this isolated overlay WebView.
        const { persisted } = await saveTodoItem(newItem);
        if (!persisted) throw new Error("persist failed");
        window.dispatchEvent(new Event("tasksUpdated"));
        // Realtime cross-WebView signals so the main app instantly
        // reconciles + routes to Today, even if it's already open in the
        // background.  Three channels for max coverage:
        //   1) BroadcastChannel — same-origin, same-device, sub-frame push
        //   2) storage event    — cross-WebView on Android (shared origin)
        //   3) localStorage flag — cold-start pickup when main app boots
        const payload = {
          type: "task-added" as const,
          id: newItem.id,
          at: Date.now(),
          source: "quick-add" as const,
        };
        try {
          const bc = new BroadcastChannel("flowist:tasks");
          bc.postMessage(payload);
          bc.close();
        } catch {}
        try {
          localStorage.setItem("quickAdd:lastAddedAt", String(payload.at));
          localStorage.setItem("quickAdd:lastAddedId", payload.id);
          // Tells the main app: on next resume, navigate to Today and
          // highlight this task.  Consumed + cleared by useQuickAddSync.
          localStorage.setItem(
            "quickAdd:pendingNavigation",
            JSON.stringify({ route: "/todo/today", taskId: payload.id, at: payload.at }),
          );
        } catch {}
        if (newItem.reminderTime) {
          import("@/utils/reminderScheduler").then(({ scheduleTaskReminder }) => {
            scheduleTaskReminder(
              newItem.id,
              newItem.text,
              new Date(newItem.reminderTime!),
              newItem.isUrgent,
            ).catch(() => {});
          });
        }
      } catch (e) {
        console.warn("[quick-add] save failed", e);
        toast.error("Could not save task");
      }
    },
    [],
  );

  const handleCreateFolder = useCallback(
    async (name: string, color: string) => {
      const newFolder: Folder = {
        id: genId(),
        name,
        color,
        isDefault: false,
        createdAt: new Date(),
      };
      const next = [...folders, newFolder];
      setFolders(next);
      const { setSetting } = await import("@/utils/settingsStorage");
      await setSetting("todoFolders", next);
    },
    [folders],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        pointerEvents: "auto",
      }}
    >
      <TaskInputSheet
        isOpen={isOpen}
        onClose={closeOverlay}
        onAddTask={handleAddTask}
        folders={folders}
        selectedFolderId={null}
        onCreateFolder={handleCreateFolder}
        sections={sections}
      />
    </div>
  );
};

export default QuickAdd;
