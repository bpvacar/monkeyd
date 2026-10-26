import { useStore } from "../store";
import {
  openFileDialog,
  openFolderDialog,
  saveActiveTab,
  exportActivePdf,
  exportActiveHtml,
  newFileIn,
  newFolderIn,
  renameEntry,
  trashEntry,
  revealEntry,
} from "../lib/fileops";
import { useState, useRef, useEffect } from "react";

function Menu({
  label,
  title,
  children,
  icon,
}: {
  label?: string;
  title: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className={`tool-btn ${label ? "labeled" : ""}`}
        title={title}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="context-menu"
          // the titlebar is a "deep" drag region; the popup must not inherit it,
          // or clicking its padding would drag the window instead of hitting an item
          data-tauri-drag-region="false"
          // anchored left: the button sits near the window's left edge, so a
          // right-anchored popup would overflow off-screen
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 180 }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Same look as the right-click menus, plus a shortcut hint. */
function MenuItem({
  onClick,
  children,
  shortcut,
  danger,
  divided,
}: {
  onClick: () => void;
  children: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  divided?: boolean;
}) {
  return (
    <button
      role="menuitem"
      className={`context-item ${danger ? "danger" : ""} ${divided ? "divided" : ""}`}
      onClick={onClick}
    >
      <span>{children}</span>
      {shortcut && <span className="shortcut">{shortcut}</span>}
    </button>
  );
}

export default function Toolbar() {
  const activeTab = useStore((s) => s.activeTab());
  const workspace = useStore((s) => s.workspace);
  const activePath = activeTab?.path ?? null;
  const setMode = useStore((s) => s.setMode);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setPluginsPanelOpen = useStore((s) => s.setPluginsPanelOpen);
  const dirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  return (
    <header className="titlebar" data-tauri-drag-region="deep">
      <button className="tool-btn" title="Toggle sidebar (⌘\)" onClick={toggleSidebar}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
          <path d="M6 2.5v11" />
        </svg>
      </button>

      <Menu
        title="File"
        icon={
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3.5-3.5z" />
            <path d="M9.5 1.5V5H13" />
          </svg>
        }
      >
        {(close) => (
          <>
            <MenuItem onClick={() => { useStore.getState().newTab(); close(); }} shortcut="⌘N">
              New tab
            </MenuItem>
            {workspace && (
              <MenuItem onClick={() => { newFileIn(workspace); close(); }} shortcut="⇧⌘N">
                New file…
              </MenuItem>
            )}
            {workspace && (
              <MenuItem onClick={() => { newFolderIn(workspace); close(); }}>
                New folder…
              </MenuItem>
            )}
            <MenuItem onClick={() => { openFileDialog(); close(); }} shortcut="⌘O" divided>
              Open file…
            </MenuItem>
            <MenuItem onClick={() => { openFolderDialog(); close(); }} shortcut="⇧⌘O">
              Open folder…
            </MenuItem>
            <MenuItem onClick={() => { saveActiveTab(); close(); }} shortcut="⌘S" divided>
              Save
            </MenuItem>
            <MenuItem onClick={() => { exportActivePdf(); close(); }} shortcut="⌘P">
              Export as PDF…
            </MenuItem>
            <MenuItem onClick={() => { exportActiveHtml(); close(); }}>
              Export as HTML…
            </MenuItem>
            {activePath && (
              <>
                <MenuItem onClick={() => { renameEntry(activePath); close(); }} divided>
                  Rename…
                </MenuItem>
                <MenuItem onClick={() => { revealEntry(activePath); close(); }}>
                  Reveal in Finder
                </MenuItem>
                <MenuItem onClick={() => { trashEntry(activePath); close(); }} danger divided>
                  Move to Trash
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>

      <div className="drag-region">
        <span className="doc-title">
          {activeTab ? activeTab.title : ""}
          {dirty && <span className="edited-dot">•</span>}
        </span>
      </div>

      {activeTab && (
        <div className="mode-switch" role="tablist" aria-label="Editor mode">
          <button
            className={activeTab.mode === "wysiwyg" ? "active" : ""}
            onClick={() => setMode("wysiwyg")}
            title="Rich editing (⌘E toggles)"
          >
            Aa
          </button>
          <button
            className={`src-label ${activeTab.mode === "source" ? "active" : ""}`}
            onClick={() => setMode("source")}
            title="Markdown source (⌘E toggles)"
          >
            {"</>"}
          </button>
        </div>
      )}

      <button
        className="tool-btn"
        title="Export as PDF (⌘P)"
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
        title="Plugins & appearance"
        onClick={() => setPluginsPanelOpen(true)}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M6 2.5h4M8 2.5v3M3 8h10M3 8a5 5 0 0 0 10 0M3 8V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2M8 13v1.5" />
        </svg>
      </button>
    </header>
  );
}
