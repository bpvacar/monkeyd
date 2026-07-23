import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./store";
import { getPendingFiles, loadUserThemes } from "./lib/backend";
import { saveActiveTab, openFileDialog, openFolderDialog, exportActivePdf } from "./lib/fileops";
import { initPlugins, notifyFileOpen } from "./plugins/runtime";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import Welcome from "./components/Welcome";
import PluginsPanel from "./components/PluginsPanel";
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
  }, [editorWidth]);

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
      const files = await getPendingFiles().catch(() => [] as string[]);
      // give the pending-file drain a beat to open anything the OS passed us
      await new Promise((r) => setTimeout(r, 150));
      if (cancelled) return;
      localStorage.setItem(WELCOMED_KEY, "1");
      const s = useStore.getState();
      if (files.length > 0 || s.tabs.length > 0) return;
      s.newTab(welcomeDoc);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

function useAutosave() {
  const tabs = useStore((s) => s.tabs);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const tab = useStore.getState().activeTab();
      if (tab && tab.path && tab.content !== tab.savedContent) {
        saveActiveTab();
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [tabs]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        saveActiveTab();
      } else if (k === "n") {
        e.preventDefault();
        s.newTab();
      } else if (k === "o" && e.shiftKey) {
        e.preventDefault();
        openFolderDialog();
      } else if (k === "o") {
        e.preventDefault();
        openFileDialog();
      } else if (k === "w") {
        e.preventDefault();
        if (s.activeTabId) s.closeTab(s.activeTabId);
      } else if (k === "e") {
        e.preventDefault();
        const tab = s.activeTab();
        if (tab) s.setMode(tab.mode === "wysiwyg" ? "source" : "wysiwyg");
      } else if (k === "p") {
        e.preventDefault();
        exportActivePdf();
      } else if (k === "\\") {
        e.preventDefault();
        s.toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
          key={`${tab.id}-w`}
          initialContent={tab.content}
          onChange={onChange}
        />
      ) : (
        <SourceEditor
          key={`${tab.id}-s`}
          initialContent={tab.content}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export default function App() {
  const toast = useStore((s) => s.toast);
  const [pluginsReady, setPluginsReady] = useState(false);

  useTheme();
  useOpenedFiles();
  useFirstRunWelcome();
  useAutosave();
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
        {pluginsReady ? <EditorPane /> : null}
      </div>
      <StatusBar />
      <PluginsPanel />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
