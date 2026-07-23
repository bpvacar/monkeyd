import { create } from "zustand";
import * as backend from "./lib/backend";

export type ViewMode = "wysiwyg" | "source";
export type ThemePref = "system" | "light" | "dark";
export type EditorWidth = "narrow" | "standard" | "wide" | "full";

export interface Tab {
  id: string;
  path: string | null;
  title: string;
  content: string;
  savedContent: string;
  mode: ViewMode;
}

let nextId = 1;
const makeId = () => `tab-${nextId++}`;

const fileName = (path: string) => path.split("/").pop() ?? path;

interface AppState {
  tabs: Tab[];
  activeTabId: string | null;
  workspace: string | null;
  sidebarOpen: boolean;
  theme: ThemePref;
  userTheme: string | null;
  editorWidth: EditorWidth;
  pluginsPanelOpen: boolean;
  toast: string | null;

  activeTab: () => Tab | null;
  newTab: (content?: string) => void;
  openPath: (path: string) => Promise<void>;
  closeTab: (id: string) => void;
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
  setPluginsPanelOpen: (open: boolean) => void;
  showToast: (msg: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  workspace: localStorage.getItem("workspace"),
  sidebarOpen: true,
  theme: (localStorage.getItem("theme") as ThemePref) || "system",
  userTheme: localStorage.getItem("userTheme"),
  editorWidth: (localStorage.getItem("editorWidth") as EditorWidth) || "wide",
  pluginsPanelOpen: false,
  toast: null,

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
      const tab: Tab = {
        id: makeId(),
        path,
        title: fileName(path),
        content,
        savedContent: content,
        mode: "wysiwyg",
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
      get().showToast(`Can't open ${fileName(path)}: ${e}`);
    }
  },

  closeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (
      tab &&
      tab.content !== tab.savedContent &&
      !window.confirm(`"${tab.title}" has unsaved changes. Close without saving?`)
    ) {
      return;
    }
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

  setTabPath: (id, path) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, path, title: fileName(path) } : t
      ),
    })),

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

  setPluginsPanelOpen: (open) => set({ pluginsPanelOpen: open }),

  showToast: (msg) => {
    set({ toast: msg });
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 2600);
  },
}));
