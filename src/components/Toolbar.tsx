import { useStore } from "../store";
import { exportActivePdf } from "../lib/fileops";

export default function Toolbar() {
  const activeTab = useStore((s) => s.activeTab());
  const setMode = useStore((s) => s.setMode);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setPluginsPanelOpen = useStore((s) => s.setPluginsPanelOpen);
  const dirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  return (
    <header className="titlebar" data-tauri-drag-region="deep">
      <button className="tool-btn" title="Toggle sidebar (⌘\)" aria-label="Toggle sidebar" onClick={toggleSidebar}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
          <path d="M6 2.5v11" />
        </svg>
      </button>

      <div className="drag-region">
        <span className="doc-title">
          {activeTab ? activeTab.title : ""}
          {dirty && <span className="edited-dot">•</span>}
        </span>
      </div>

      {activeTab && (
        <div className="mode-switch" role="group" aria-label="Editor mode">
          <button
            className={activeTab.mode === "wysiwyg" ? "active" : ""}
            aria-pressed={activeTab.mode === "wysiwyg"}
            onClick={() => setMode("wysiwyg")}
            title="Rich editing (⇧⌘E toggles)"
          >
            Aa
          </button>
          <button
            className={`src-label ${activeTab.mode === "source" ? "active" : ""}`}
            aria-pressed={activeTab.mode === "source"}
            onClick={() => setMode("source")}
            title="Markdown source (⇧⌘E toggles)"
          >
            {"</>"}
          </button>
        </div>
      )}

      <button
        className="tool-btn"
        title="Export as PDF (⌘P)"
        aria-label="Export as PDF"
        onClick={exportActivePdf}
        disabled={!activeTab}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M4 6.5V2.5h8v4" />
          <rect x="2.5" y="6.5" width="11" height="5" rx="1" />
          <path d="M4 11.5v3h8v-3" />
        </svg>
      </button>

      <button
        className="tool-btn"
        title="Settings (⌘,)"
        aria-label="Settings"
        onClick={() => setPluginsPanelOpen(true)}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2.5 4.5h11M2.5 11.5h11" />
          <circle cx="10.5" cy="4.5" r="1.6" fill="var(--chrome)" />
          <circle cx="5.5" cy="11.5" r="1.6" fill="var(--chrome)" />
        </svg>
      </button>
    </header>
  );
}
