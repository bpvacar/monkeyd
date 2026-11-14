import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useStore } from "../store";
import { pickMatch, type FindDir } from "../lib/find";

/** ⌘F bar above the document; driven by `findCommand` (shortcuts and the menu). */
export default function FindBar() {
  const target = useStore((s) => s.findTarget);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState({ index: 0, total: 0 });
  const input = useRef<HTMLInputElement>(null);

  const run = useCallback(
    (dir: FindDir) => {
      if (!target) return;
      const ms = target.matches(query);
      const i = pickMatch(ms, target.selection(), dir);
      target.show(query, ms, ms[i]);
      setFound({ index: i + 1, total: ms.length });
    },
    [target, query]
  );

  // re-search as you type, and when the editor underneath changes (tab switch, ⌘E)
  // shortcut: edits made in the document while the bar is open aren't re-counted until the next search or step
  useEffect(() => {
    if (open) run(0);
  }, [open, run]);

  useEffect(() => {
    const onFind = (e: Event) => {
      const dir = (e as CustomEvent<FindDir>).detail;
      // the tab, not the editor: rich text mounts a beat after ⌘E or a tab switch
      if (!useStore.getState().activeTabId) return;
      if (open && dir) return run(dir);
      // render now, not after the next task: the keys typed right after ⌘F
      // would otherwise land in the document
      flushSync(() => setOpen(true));
      input.current?.select();
    };
    window.addEventListener("find", onFind);
    return () => window.removeEventListener("find", onFind);
  }, [open, run]);

  const close = () => {
    setOpen(false);
    target?.close();
  };

  if (!open || !target) return null;

  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        autoFocus
        type="search"
        aria-label="Find in document"
        placeholder="Find"
        spellCheck={false}
        value={query}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") run(e.shiftKey ? -1 : 1);
          else if (e.key === "Escape") close();
          else return;
          e.preventDefault();
        }}
      />
      <span className="find-count" aria-live="polite">
        {!query ? "" : found.total ? `${found.index} of ${found.total}` : "Not found"}
      </span>
      <button className="tool-btn" title="Previous (⇧⌘G)" aria-label="Previous match" onClick={() => run(-1)} disabled={!found.total}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
      <button className="tool-btn" title="Next (⌘G)" aria-label="Next match" onClick={() => run(1)} disabled={!found.total}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <button className="find-done" onClick={close}>
        Done
      </button>
    </div>
  );
}
