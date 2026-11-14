import { create } from "zustand";
import * as backend from "./lib/backend";
import type { FindTarget } from "./lib/find";
import type { FormatTarget } from "./lib/format";
import { rememberRecent } from "./lib/recent";

export type ViewMode = "wysiwyg" | "source";
export type ThemePref = "system" | "light" | "dark";
export type EditorWidth = "narrow" | "standard" | "wide" | "full";

export interface PromptRequest {
  title: string;
  label: string;
  initial: string;
  confirmLabel?: string;
  /** Selects everything before the extension, the way Finder does. */
  selectBasename?: boolean;
  resolve: (value: string | null) => void;
}

export interface Toast {
  text: string;
  /** Errors stay until dismissed; info fades on its own. */
  kind: "info" | "error";
  action?: { label: string; run: () => void };
}

/** Turns an OS error string into words, keeping the original when it's not a known case. */
export function explain(e: unknown): string {
  const raw = String(e);
  if (/permission denied|not permitted|os error (1|13)\b/i.test(raw))
    return "MonkeyD doesn't have permission to change it there.";
  if (/no such file|not found|os error 2\b/i.test(raw))
    return "It isn't there anymore — it may have been moved or deleted.";
  if (/already ?exists|os error 17\b/i.test(raw)) return "Something with that name is already there.";
  if (/no space|os error 28\b/i.test(raw)) return "The disk is full.";
  return raw;
}

export interface Tab {
  id: string;
  path: string | null;
  title: string;
  content: string;
  savedContent: string;
  mode: ViewMode;
  /** `mtime:size` of the file as this tab last saw it; null for untitled. */
  diskStamp: string | null;
  /** Someone else changed the file while we had unsaved edits. */
  conflict: boolean;
  /** Bumped to force the editor to remount with reloaded content. */
  reloadNonce: number;
}

let nextId = 1;
const makeId = () => `tab-${nextId++}`;

export const fileName = (path: string) => path.split("/").pop() ?? path;
export const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

interface AppState {
  tabs: Tab[];
  activeTabId: string | null;
  workspace: string | null;
  sidebarOpen: boolean;
  theme: ThemePref;
  userTheme: string | null;
  editorWidth: EditorWidth;
  attachmentFolder: string;
  imageMaxEdge: number;
  pluginsPanelOpen: boolean;
  unusedImagesOpen: boolean;
  /** Format menu commands for the mounted editor, if any. */
  formatTarget: FormatTarget | null;
  /** The mounted editor the find bar searches, if any. */
  findTarget: FindTarget | null;
  toast: Toast | null;
  prompt: PromptRequest | null;
  treeVersion: number;

  activeTab: () => Tab | null;
  newTab: (content?: string) => void;
  openPath: (path: string) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  setContent: (id: string, content: string) => void;
  markSaved: (id: string, content: string) => void;
  setTabPath: (id: string, path: string) => void;
  setMode: (mode: ViewMode) => void;
  setWorkspace: (path: string | null) => void;
  toggleSidebar: () => void;
  setTheme: (t: ThemePref) => void;
  setUserTheme: (name: string | null) => void;
  setEditorWidth: (w: EditorWidth) => void;
  setAttachmentFolder: (folder: string) => void;
  setImageMaxEdge: (px: number) => void;
  setPluginsPanelOpen: (open: boolean) => void;
  setFindTarget: (t: FindTarget | null) => void;
  setUnusedImagesOpen: (open: boolean) => void;
  setFormatTarget: (t: FormatTarget | null) => void;
  showToast: (text: string, kind?: Toast["kind"], action?: Toast["action"]) => void;
  dismissToast: () => void;
  askName: (opts: Omit<PromptRequest, "resolve">) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;
  pathRenamed: (from: string, to: string) => void;
  pathRemoved: (path: string) => void;
  refreshTree: () => void;
  setDiskStamp: (id: string, stamp: string | null) => void;
  setConflict: (id: string, conflict: boolean) => void;
  applyExternalContent: (id: string, content: string, stamp: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  workspace: localStorage.getItem("workspace"),
  sidebarOpen: true,
  theme: (localStorage.getItem("theme") as ThemePref) || "system",
  userTheme: localStorage.getItem("userTheme"),
  editorWidth: (localStorage.getItem("editorWidth") as EditorWidth) || "wide",
  attachmentFolder: localStorage.getItem("attachmentFolder") ?? "assets",
  imageMaxEdge: Number(localStorage.getItem("imageMaxEdge") ?? 2560),
  pluginsPanelOpen: false,
  findTarget: null,
  unusedImagesOpen: false,
  formatTarget: null,
  toast: null,
  prompt: null,
  treeVersion: 0,

  activeTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },

  newTab: (content = "") => {
    const tab: Tab = {
      id: makeId(),
      path: null,
      title: "Untitled",
      content,
      savedContent: content,
      mode: "wysiwyg",
      diskStamp: null,
      conflict: false,
      reloadNonce: 0,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openPath: async (path) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    try {
      const content = await backend.readTextFile(path);
      const stamp = await backend.fileStamp(path).catch(() => null);
      rememberRecent(path);
      const tab: Tab = {
        id: makeId(),
        path,
        title: fileName(path),
        content,
        savedContent: content,
        mode: "wysiwyg",
        diskStamp: stamp,
        conflict: false,
        reloadNonce: 0,
      };
      set((s) => {
        // replace a pristine empty untitled tab instead of stacking next to it
        const active = s.tabs.find((t) => t.id === s.activeTabId);
        const tabs =
          active && !active.path && active.content === ""
            ? s.tabs.map((t) => (t.id === active.id ? tab : t))
            : [...s.tabs, tab];
        return { tabs, activeTabId: tab.id };
      });
    } catch (e) {
      get().showToast(`Couldn't open “${fileName(path)}”. ${explain(e)}`, "error");
    }
  },

  closeTab: async (id) => {
    // dynamic: fileops imports this store
    const { settleUnsaved } = await import("./lib/fileops");
    if (!(await settleUnsaved(id))) return;
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === id) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    });
  },

  setActive: (id) => set({ activeTabId: id }),

  setContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    })),

  markSaved: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, savedContent: content } : t
      ),
    })),

  setTabPath: (id, path) => {
    rememberRecent(path);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, path, title: fileName(path) } : t
      ),
    }));
  },

  setMode: (mode) => {
    const active = get().activeTab();
    if (!active) return;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, mode } : t)),
    }));
  },

  setWorkspace: (path) => {
    if (path) localStorage.setItem("workspace", path);
    else localStorage.removeItem("workspace");
    set({ workspace: path, sidebarOpen: true });
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setTheme: (t) => {
    localStorage.setItem("theme", t);
    set({ theme: t });
  },

  setUserTheme: (name) => {
    if (name) localStorage.setItem("userTheme", name);
    else localStorage.removeItem("userTheme");
    set({ userTheme: name });
  },

  setEditorWidth: (w) => {
    localStorage.setItem("editorWidth", w);
    set({ editorWidth: w });
  },

  setAttachmentFolder: (folder) => {
    localStorage.setItem("attachmentFolder", folder);
    set({ attachmentFolder: folder });
  },

  setImageMaxEdge: (px) => {
    localStorage.setItem("imageMaxEdge", String(px));
    set({ imageMaxEdge: px });
  },

  setPluginsPanelOpen: (open) => set({ pluginsPanelOpen: open }),
  setFindTarget: (findTarget) => set({ findTarget }),
  setUnusedImagesOpen: (unusedImagesOpen) => set({ unusedImagesOpen }),
  setFormatTarget: (formatTarget) => set({ formatTarget }),

  askName: (opts) =>
    new Promise<string | null>((resolve) => {
      set({ prompt: { ...opts, resolve } });
    }),

  resolvePrompt: (value) => {
    const p = get().prompt;
    set({ prompt: null });
    p?.resolve(value);
  },

  /**
   * A file or folder moved on disk. Retarget any tab pointing at it — and,
   * when a folder moved, every tab for a file underneath it.
   */
  pathRenamed: (from, to) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!t.path) return t;
        if (t.path === from) return { ...t, path: to, title: fileName(to) };
        if (t.path.startsWith(`${from}/`)) {
          const moved = to + t.path.slice(from.length);
          return { ...t, path: moved, title: fileName(moved) };
        }
        return t;
      }),
    })),

  /** A file or folder is gone; drop its tabs without prompting to save. */
  pathRemoved: (path) =>
    set((s) => {
      const gone = (p: string | null) =>
        p != null && (p === path || p.startsWith(`${path}/`));
      const tabs = s.tabs.filter((t) => !gone(t.path));
      if (tabs.length === s.tabs.length) return {};
      const stillThere = tabs.some((t) => t.id === s.activeTabId);
      return {
        tabs,
        activeTabId: stillThere ? s.activeTabId : tabs[tabs.length - 1]?.id ?? null,
      };
    }),

  refreshTree: () => set((s) => ({ treeVersion: s.treeVersion + 1 })),

  setDiskStamp: (id, stamp) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, diskStamp: stamp } : t)),
    })),

  setConflict: (id, conflict) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, conflict } : t)),
    })),

  /** Replaces a tab's text with what's on disk, remounting the editor. */
  applyExternalContent: (id, content, stamp) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              content,
              savedContent: content,
              diskStamp: stamp,
              conflict: false,
              reloadNonce: t.reloadNonce + 1,
            }
          : t
      ),
    })),

  showToast: (text, kind = "info", action) => {
    const toast: Toast = { text, kind, action };
    set({ toast });
    if (kind === "info") {
      window.setTimeout(() => {
        if (get().toast === toast) set({ toast: null });
      }, 2600);
    }
  },
  dismissToast: () => set({ toast: null }),
}));
