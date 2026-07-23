import { useStore } from "../store";

export default function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const newTab = useStore((s) => s.newTab);

  if (tabs.length === 0) return null;

  return (
    <div className="tabbar">
      {tabs.map((t) => {
        const dirty = t.content !== t.savedContent;
        return (
          <div
            key={t.id}
            className={`tab ${t.id === activeTabId ? "active" : ""}`}
            onClick={() => setActive(t.id)}
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
    </div>
  );
}
