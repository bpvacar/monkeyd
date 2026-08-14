import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { listDir, type DirEntry } from "../lib/backend";
import {
  openFolderDialog,
  renameEntry,
  trashEntry,
  newFileIn,
  newFolderIn,
  duplicateEntry,
  revealEntry,
} from "../lib/fileops";
import ContextMenu, { useContextMenu, type MenuItem } from "./ContextMenu";

function TreeNode({
  entry,
  depth,
  onContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const openPath = useStore((s) => s.openPath);
  const activePath = useStore((s) => s.activeTab()?.path);
  const treeVersion = useStore((s) => s.treeVersion);

  const load = useCallback(async () => {
    try {
      setChildren(await listDir(entry.path));
    } catch {
      setChildren([]);
    }
  }, [entry.path]);

  // an open folder re-reads itself whenever something on disk changes
  useEffect(() => {
    if (open && entry.is_dir) load();
  }, [treeVersion, open, entry.is_dir, load]);

  const toggle = useCallback(async () => {
    if (entry.is_dir) {
      if (!open && children === null) await load();
      setOpen((o) => !o);
    } else {
      openPath(entry.path);
    }
  }, [entry, open, children, openPath, load]);

  return (
    <>
      <button
        className={`tree-row ${entry.is_dir ? "dir" : ""} ${
          activePath === entry.path ? "active" : ""
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={toggle}
        onContextMenu={(e) => onContextMenu(e, entry)}
        title={entry.path}
      >
        <span className={`chev ${open ? "open" : ""}`}>
          {entry.is_dir ? "▶" : ""}
        </span>
        <span className="name">{entry.name}</span>
      </button>
      {open &&
        children?.map((c) => (
          <TreeNode
            key={c.path}
            entry={c}
            depth={depth + 1}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
}

export default function Sidebar() {
  const workspace = useStore((s) => s.workspace);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const treeVersion = useStore((s) => s.treeVersion);
  const refreshTree = useStore((s) => s.refreshTree);
  const [roots, setRoots] = useState<DirEntry[]>([]);
  const { menu, openMenu, closeMenu } = useContextMenu();

  useEffect(() => {
    if (!workspace) return;
    listDir(workspace)
      .then(setRoots)
      .catch(() => {
        setRoots([]);
        useStore.getState().setWorkspace(null);
      });
  }, [workspace, treeVersion]);

  const entryMenu = (e: React.MouseEvent, entry: DirEntry) => {
    const parent = entry.is_dir
      ? entry.path
      : entry.path.slice(0, entry.path.lastIndexOf("/"));
    const items: MenuItem[] = [
      { label: "New file…", onSelect: () => newFileIn(parent) },
      { label: "New folder…", onSelect: () => newFolderIn(parent) },
      {
        label: "Rename…",
        dividerBefore: true,
        onSelect: () => renameEntry(entry.path, entry.is_dir),
      },
      ...(entry.is_dir
        ? []
        : [{ label: "Duplicate", onSelect: () => duplicateEntry(entry.path) }]),
      { label: "Reveal in Finder", onSelect: () => revealEntry(entry.path) },
      {
        label: "Move to Trash",
        danger: true,
        dividerBefore: true,
        onSelect: () => trashEntry(entry.path, entry.is_dir),
      },
    ];
    openMenu(e, items);
  };

  const backgroundMenu = (e: React.MouseEvent) => {
    if (!workspace) return;
    openMenu(e, [
      { label: "New file…", onSelect: () => newFileIn(workspace) },
      { label: "New folder…", onSelect: () => newFolderIn(workspace) },
      { label: "Refresh", dividerBefore: true, onSelect: refreshTree },
      {
        label: "Reveal in Finder",
        onSelect: () => revealEntry(workspace),
      },
    ]);
  };

  const folderName = workspace?.split("/").pop() ?? "";

  return (
    <aside className={`sidebar ${sidebarOpen ? "" : "hidden"}`}>
      {workspace ? (
        <>
          <div className="sidebar-head" onContextMenu={backgroundMenu}>
            <span title={workspace}>{folderName}</span>
            <span className="actions">
              <button
                className="tool-btn"
                title="New file"
                onClick={() => newFileIn(workspace)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5z" />
                  <path d="M8 7.5v4M6 9.5h4" />
                </svg>
              </button>
              <button
                className="tool-btn"
                title="New folder"
                onClick={() => newFolderIn(workspace)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 2h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
                  <path d="M8 8v4M6 10h4" />
                </svg>
              </button>
              <button className="tool-btn" title="Refresh" onClick={refreshTree}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" />
                </svg>
              </button>
            </span>
          </div>
          <div className="tree" onContextMenu={backgroundMenu}>
            {roots.map((e) => (
              <TreeNode
                key={e.path}
                entry={e}
                depth={0}
                onContextMenu={entryMenu}
              />
            ))}
            {roots.length === 0 && (
              <div className="tree-empty">No markdown files here yet.</div>
            )}
          </div>
        </>
      ) : (
        <div className="tree-empty">
          Open a folder to browse its markdown files here.
          <br />
          <br />
          <button onClick={openFolderDialog}>Open folder…</button>
        </div>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </aside>
  );
}
