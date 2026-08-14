import { useStore, type Tab } from "../store";
import {
  renameEntry,
  trashEntry,
  revealEntry,
  duplicateEntry,
  saveActiveTab,
} from "../lib/fileops";
import ContextMenu, { useContextMenu, type MenuItem } from "./ContextMenu";

export default function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const newTab = useStore((s) => s.newTab);
  const { menu, openMenu, closeMenu } = useContextMenu();

  if (tabs.length === 0) return null;

  const tabMenu = (e: React.MouseEvent, tab: Tab) => {
    const onDisk = tab.path;
    const items: MenuItem[] = [
      {
        label: onDisk ? "Rename…" : "Save as…",
        onSelect: () => (onDisk ? renameEntry(onDisk) : saveActiveTab()),
      },
      {
        label: "Duplicate",
        disabled: !onDisk,
        onSelect: () => onDisk && duplicateEntry(onDisk),
      },
      {
        label: "Reveal in Finder",
        disabled: !onDisk,
        onSelect: () => onDisk && revealEntry(onDisk),
      },
      {
        label: "Close",
        dividerBefore: true,
        onSelect: () => closeTab(tab.id),
      },
      {
        label: "Close others",
        disabled: tabs.length < 2,
        onSelect: () => {
          for (const t of tabs) if (t.id !== tab.id) closeTab(t.id);
        },
      },
      {
        label: "Move to Trash",
        danger: true,
        disabled: !onDisk,
        dividerBefore: true,
        onSelect: () => onDisk && trashEntry(onDisk),
      },
    ];
    openMenu(e, items);
  };

  return (
    <div className="tabbar">
      {tabs.map((t) => {
        const dirty = t.content !== t.savedContent;
        return (
          <div
            key={t.id}
            className={`tab ${t.id === activeTabId ? "active" : ""}`}
            onClick={() => setActive(t.id)}
            onContextMenu={(e) => {
              setActive(t.id);
              tabMenu(e, t);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(t.id);
            }}
            title={t.path ?? "Unsaved"}
            role="tab"
            aria-selected={t.id === activeTabId}
          >
            {dirty && <span className="dot" title="Unsaved changes" />}
            <span className="label">{t.title}</span>
            <button
              className="close"
              aria-label={`Close ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="tab-new" title="New tab (⌘N)" onClick={() => newTab()}>
        +
      </button>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
