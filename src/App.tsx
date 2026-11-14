import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore, type EditorWidth, type ThemePref } from "./store";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { Format } from "./lib/format";
import { armQuitGuard, getPendingFiles, loadUserThemes, quit, setChecked } from "./lib/backend";
import {
  saveTab,
  saveActiveTab,
  settleUnsaved,
  openFileDialog,
  openFolderDialog,
  exportActivePdf,
  exportActiveHtml,
  newFileIn,
  newFolderIn,
  renameEntry,
  revealEntry,
  trashEntry,
} from "./lib/fileops";
import { openUrl } from "@tauri-apps/plugin-opener";
import { findCommand } from "./lib/find";
import { clearRecent, rememberRecent } from "./lib/recent";
import FindBar from "./components/FindBar";
import UnusedImagesPanel from "./components/UnusedImagesPanel";
import { initPlugins, notifyFileOpen } from "./plugins/runtime";
import { checkTabsAgainstDisk } from "./lib/sync";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import Welcome from "./components/Welcome";
import PluginsPanel from "./components/PluginsPanel";
import PromptDialog from "./components/PromptDialog";
import ConflictBar from "./components/ConflictBar";
import WysiwygEditor from "./components/WysiwygEditor";
import SourceEditor from "./components/SourceEditor";
import welcomeDoc from "./welcome.md?raw";

const USER_THEME_STYLE_ID = "user-theme-css";

function useTheme() {
  const theme = useStore((s) => s.theme);
  const userTheme = useStore((s) => s.userTheme);
  const editorWidth = useStore((s) => s.editorWidth);

  useEffect(() => {
    document.documentElement.dataset.width = editorWidth;
    setChecked("width", editorWidth).catch(() => {});
  }, [editorWidth]);

  useEffect(() => {
    setChecked("theme", theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.getElementById(USER_THEME_STYLE_ID)?.remove();
    if (!userTheme) return;
    loadUserThemes()
      .then((themes) => {
        const t = themes.find((x) => x.name === userTheme);
        if (!t) return;
        const el = document.createElement("style");
        el.id = USER_THEME_STYLE_ID;
        el.textContent = t.css;
        document.head.appendChild(el);
      })
      .catch(() => {});
  }, [userTheme]);
}

function useOpenedFiles() {
  const openPath = useStore((s) => s.openPath);
  useEffect(() => {
    const drain = async () => {
      const files = await getPendingFiles().catch(() => [] as string[]);
      for (const f of files) await openPath(f);
    };
    drain();
    const unlisten = listen("files-pending", drain);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openPath]);
}

const WELCOMED_KEY = "welcomedV1";

// On first ever launch, greet the user with a live welcome document —
// but only if they didn't launch by opening a specific file.
function useFirstRunWelcome() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (localStorage.getItem(WELCOMED_KEY)) return;
    let cancelled = false;
    (async () => {
      // give the pending-file drain a beat to open anything the OS passed us;
      // don't drain the queue here, or those files would never open
      await new Promise((r) => setTimeout(r, 150));
      if (cancelled) return;
      localStorage.setItem(WELCOMED_KEY, "1");
      const s = useStore.getState();
      if (s.tabs.length > 0) return;
      s.newTab(welcomeDoc);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

/**
 * Files here get edited by other tools while the app is open, so open tabs are
 * checked against disk on focus (the common case: leave, something edits, come
 * back) and on a slow poll for edits that land while the window is visible.
 */
function useDiskWatch() {
  useEffect(() => {
    const check = () => {
      checkTabsAgainstDisk();
    };
    check();
    const onFocus = () => check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 3000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);
}

function useAutosave() {
  const tabs = useStore((s) => s.tabs);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const tab = useStore.getState().activeTab();
      if (tab && tab.path && !tab.conflict && tab.content !== tab.savedContent) {
        saveActiveTab();
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [tabs]);
}

/**
 * ⌘Q and the close button come here first: tabs backed by a file are saved,
 * and anything still unsaved (scratch tabs, conflicts, failed saves) is asked
 * about before the app exits.
 */
function useQuitGuard() {
  useEffect(() => {
    const unlisten = listen("quit-requested", async () => {
      for (const t of useStore.getState().tabs) {
        if (t.path && !t.conflict && t.content !== t.savedContent) await saveTab(t.id);
      }
      // what's left (scratch tabs, conflicts, failed saves) is asked about one by one
      for (const t of useStore.getState().tabs) {
        if (!(await settleUnsaved(t.id))) return;
      }
      quit();
    });
    unlisten.then(() => armQuitGuard());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}

/** One action per id, shared by the keyboard shortcuts and the native menu. */
const actions: Record<string, () => void> = {
  "new-tab": () => useStore.getState().newTab(),
  // a real file in the workspace, named; plain ⌘N stays a scratch tab
  "new-file": () => {
    const s = useStore.getState();
    if (s.workspace) newFileIn(s.workspace);
    else s.newTab();
  },
  "new-folder": () => {
    const ws = useStore.getState().workspace;
    if (ws) newFolderIn(ws);
  },
  open: openFileDialog,
  "open-folder": openFolderDialog,
  save: saveActiveTab,
  "save-as": () => {
    const id = useStore.getState().activeTabId;
    if (id) saveTab(id, true);
  },
  "unused-images": () => useStore.getState().setUnusedImagesOpen(true),
  "clear-recent": clearRecent,
  "find-replace": () => findCommand("replace"),
  "zoom-in": () => zoomBy(1.1),
  "zoom-out": () => zoomBy(1 / 1.1),
  "zoom-reset": () => zoomBy(0),
  "next-tab": () => cycleTab(1),
  "prev-tab": () => cycleTab(-1),
  "export-pdf": exportActivePdf,
  "export-html": exportActiveHtml,
  rename: () => withActivePath(renameEntry),
  reveal: () => withActivePath(revealEntry),
  trash: () => withActivePath(trashEntry),
  "close-tab": () => {
    const s = useStore.getState();
    if (s.activeTabId) s.closeTab(s.activeTabId);
  },
  "toggle-mode": () => {
    const s = useStore.getState();
    const tab = s.activeTab();
    if (tab) s.setMode(tab.mode === "wysiwyg" ? "source" : "wysiwyg");
  },
  "toggle-sidebar": () => useStore.getState().toggleSidebar(),
  // ⌘, is the macOS convention for settings
  settings: () => {
    const s = useStore.getState();
    s.setPluginsPanelOpen(!s.pluginsPanelOpen);
  },
  find: () => findCommand(0),
  "use-selection": () => findCommand("selection"),
  "find-next": () => findCommand(1),
  "find-previous": () => findCommand(-1),
  welcome: () => useStore.getState().newTab(welcomeDoc),
  help: () => openUrl("https://github.com/bpvacar/monkeyd"),
};

const ZOOM_KEY = "zoom";

/** Whole-window zoom, like Safari's; `0` resets, `1` just re-applies the saved level. */
function zoomBy(factor: number) {
  const now = Number(localStorage.getItem(ZOOM_KEY) ?? 1) || 1;
  const z = factor === 0 ? 1 : Math.min(3, Math.max(0.5, Math.round(now * factor * 100) / 100));
  localStorage.setItem(ZOOM_KEY, String(z));
  try {
    getCurrentWebview().setZoom(z).catch(() => {});
  } catch {
    // no Tauri webview (the Vite preview in a plain browser)
  }
}

/** Menu ids are `name` or `group:value` (format:bold, theme:dark, width:wide, recent:/path). */
function runAction(id: string) {
  const colon = id.indexOf(":");
  if (colon === -1) return actions[id]?.();
  const group = id.slice(0, colon);
  const value = id.slice(colon + 1);
  const s = useStore.getState();
  if (group === "recent") s.openPath(value);
  else if (group === "format") s.formatTarget?.(value as Format);
  else if (group === "theme" || group === "width") {
    if (group === "theme") s.setTheme(value as ThemePref);
    else s.setEditorWidth(value as EditorWidth);
    // macOS flips a check item on click; re-tick in case the same value was picked again
    setChecked(group, value).catch(() => {});
  }
}

function cycleTab(step: number) {
  const s = useStore.getState();
  const i = s.tabs.findIndex((t) => t.id === s.activeTabId);
  const next = s.tabs[(i + step + s.tabs.length) % s.tabs.length];
  if (next) s.setActive(next.id);
}

function withActivePath(fn: (path: string) => unknown) {
  const path = useStore.getState().activeTab()?.path;
  if (path) fn(path);
}

/** ⌘-key → action id; ⇧ is spelled as a prefix. Mirrored as accelerators in the Rust menu. */
const SHORTCUTS: Record<string, string> = {
  n: "new-tab",
  "⇧n": "new-file",
  o: "open",
  "⇧o": "open-folder",
  s: "save",
  b: "format:bold",
  i: "format:italic",
  k: "format:link",
  "=": "zoom-in",
  "⇧+": "zoom-in",
  "-": "zoom-out",
  "0": "zoom-reset",
  "⇧s": "save-as",
  p: "export-pdf",
  w: "close-tab",
  e: "use-selection",
  "⇧e": "toggle-mode",
  "\\": "toggle-sidebar",
  ",": "settings",
  f: "find",
  g: "find-next",
  "⇧g": "find-previous",
};

function useShortcuts() {
  useEffect(() => {
    // Capture phase, so app shortcuts win over the editors' own keymaps
    // (Milkdown binds ⌘E to inline code; ours is ⌘/); preventing the default
    // keeps WebKit from also firing the menu item's accelerator.
    const onKey = (e: KeyboardEvent) => {
      // ⌃Tab / ⌃⇧Tab cycle tabs; ⌘1–9 jump to one (⌘9 = last), as in Safari
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        return cycleTab(e.shiftKey ? -1 : 1);
      }
      if (!e.metaKey) return;
      // ⌥ changes e.key ("¡", "ƒ"), so ⌥⌘ shortcuts go by physical key
      if (e.altKey) {
        const digit = /^(Digit|Numpad)([1-6])$/.exec(e.code)?.[2];
        const id = digit
          ? `format:h${digit}`
          : e.code === "KeyF"
            ? "find-replace"
            : null;
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        return runAction(id);
      }
      if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        const { tabs, setActive } = useStore.getState();
        const t = e.key === "9" ? tabs[tabs.length - 1] : tabs[Number(e.key) - 1];
        if (t) setActive(t.id);
        return;
      }
      const id = SHORTCUTS[(e.shiftKey ? "⇧" : "") + e.key.toLowerCase()];
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      runAction(id);
    };
    window.addEventListener("keydown", onKey, true);
    rememberRecent();
    zoomBy(1);
    const unlisten = listen<string>("menu", ({ payload: id }) => runAction(id));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      unlisten.then((fn) => fn());
    };
  }, []);
}

function EditorPane() {
  const tab = useStore((s) => s.activeTab());
  const setContent = useStore((s) => s.setContent);

  const onChange = useCallback(
    (md: string) => {
      const active = useStore.getState().activeTab();
      if (active) setContent(active.id, md);
    },
    [setContent]
  );

  useEffect(() => {
    if (tab) notifyFileOpen(tab.path, tab.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id]);

  if (!tab) return <Welcome />;

  // key remounts the editor when the document or mode changes;
  // within a mount the editor owns the text and pushes changes up.
  return (
    <div className="editor-host">
      {tab.mode === "wysiwyg" ? (
        <WysiwygEditor
          key={`${tab.id}-w-${tab.reloadNonce}`}
          initialContent={tab.content}
          onChange={onChange}
        />
      ) : (
        <SourceEditor
          key={`${tab.id}-s-${tab.reloadNonce}`}
          initialContent={tab.content}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export default function App() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);
  const [pluginsReady, setPluginsReady] = useState(false);

  useTheme();
  useOpenedFiles();
  useFirstRunWelcome();
  useDiskWatch();
  useAutosave();
  useQuitGuard();
  useShortcuts();

  useEffect(() => {
    initPlugins().finally(() => setPluginsReady(true));
  }, []);

  // dev-only preview hook: ?demo[=source]&theme=light|dark seeds a document
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(location.search);
    const t = params.get("theme");
    if (t === "light" || t === "dark") useStore.getState().setTheme(t);
    if (params.has("demo")) {
      import("../SAMPLE.md?raw").then(({ default: md }) => {
        const s = useStore.getState();
        s.newTab(md);
        if (params.get("demo") === "source") s.setMode("source");
        if (params.has("print")) setTimeout(exportActivePdf, 400);
      });
    }
  }, []);

  return (
    <div className="shell">
      <Toolbar />
      <Sidebar />
      <div className="main">
        <TabBar />
        <ConflictBar />
        <FindBar />
        {pluginsReady ? <EditorPane /> : null}
      </div>
      <StatusBar />
      <PluginsPanel />
      <PromptDialog />
      <UnusedImagesPanel />
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="toast-btn"
              onClick={() => {
                dismissToast();
                toast.action?.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
          {toast.kind === "error" && (
            <button className="toast-btn" aria-label="Dismiss" onClick={dismissToast}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
