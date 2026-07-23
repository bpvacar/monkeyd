import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { listDir, createFile, type DirEntry } from "../lib/backend";
import { openFolderDialog } from "../lib/fileops";

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const openPath = useStore((s) => s.openPath);
  const activePath = useStore((s) => s.activeTab()?.path);

  const toggle = useCallback(async () => {
    if (entry.is_dir) {
      if (!open && children === null) {
        try {
          setChildren(await listDir(entry.path));
        } catch {
          setChildren([]);
        }
      }
      setOpen((o) => !o);
    } else {
      openPath(entry.path);
    }
  }, [entry, open, children, openPath]);

  return (
    <>
      <button
        className={`tree-row ${entry.is_dir ? "dir" : ""} ${
          activePath === entry.path ? "active" : ""
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={toggle}
        title={entry.path}
      >
        <span className={`chev ${open ? "open" : ""}`}>
          {entry.is_dir ? "▶" : ""}
        </span>
        <span className="name">{entry.name}</span>
      </button>
      {open &&
        children?.map((c) => (
          <TreeNode key={c.path} entry={c} depth={depth + 1} />
        ))}
    </>
  );
}

export default function Sidebar() {
  const workspace = useStore((s) => s.workspace);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const openPath = useStore((s) => s.openPath);
  const showToast = useStore((s) => s.showToast);
  const [roots, setRoots] = useState<DirEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!workspace) return;
    listDir(workspace)
      .then(setRoots)
      .catch(() => {
        setRoots([]);
        useStore.getState().setWorkspace(null);
      });
  }, [workspace, refreshKey]);

  const newFileInWorkspace = async () => {
    if (!workspace) return;
    let name = "Untitled.md";
    let n = 1;
    const names = new Set(roots.map((r) => r.name));
    while (names.has(name)) name = `Untitled ${++n}.md`;
    const path = `${workspace}/${name}`;
    try {
      await createFile(path);
      setRefreshKey((k) => k + 1);
      await openPath(path);
    } catch (e) {
      showToast(String(e));
    }
  };

  const folderName = workspace?.split("/").pop() ?? "";

  return (
    <aside className={`sidebar ${sidebarOpen ? "" : "hidden"}`}>
      {workspace ? (
        <>
          <div className="sidebar-head">
            <span title={workspace}>{folderName}</span>
            <span className="actions">
              <button
                className="tool-btn"
                title="New file in folder"
                onClick={newFileInWorkspace}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5z" />
                  <path d="M8 7.5v4M6 9.5h4" />
                </svg>
              </button>
              <button
                className="tool-btn"
                title="Refresh"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" />
                </svg>
              </button>
            </span>
          </div>
          <div className="tree">
            {roots.map((e) => (
              <TreeNode key={e.path} entry={e} depth={0} />
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
    </aside>
  );
}
