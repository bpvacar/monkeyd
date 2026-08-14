import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import * as backend from "./backend";
import { exportToPdf, exportToHtml } from "./exporter";

const MD_FILTER = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
];

export async function openFileDialog() {
  const picked = await open({ multiple: true, filters: MD_FILTER });
  if (!picked) return;
  const paths = Array.isArray(picked) ? picked : [picked];
  for (const p of paths) await useStore.getState().openPath(p);
}

export async function openFolderDialog() {
  const picked = await open({ directory: true });
  if (typeof picked === "string") useStore.getState().setWorkspace(picked);
}

export async function saveActiveTab(): Promise<boolean> {
  const s = useStore.getState();
  const tab = s.activeTab();
  if (!tab) return false;
  let path = tab.path;
  if (!path) {
    const picked = await save({
      filters: MD_FILTER,
      defaultPath: "Untitled.md",
    });
    if (!picked) return false;
    path = picked;
    s.setTabPath(tab.id, path);
  }
  try {
    await backend.writeTextFile(path, tab.content);
    s.markSaved(tab.id, tab.content);
    return true;
  } catch (e) {
    s.showToast(`Save failed: ${e}`);
    return false;
  }
}

export async function exportActivePdf() {
  const tab = useStore.getState().activeTab();
  if (!tab) return;
  exportToPdf(tab.content);
}

export async function exportActiveHtml() {
  const s = useStore.getState();
  const tab = s.activeTab();
  if (!tab) return;
  const picked = await save({
    filters: [{ name: "HTML", extensions: ["html"] }],
    defaultPath: tab.title.replace(/\.(md|markdown|mdown|mkd|txt)$/i, "") + ".html",
  });
  if (!picked) return;
  try {
    await backend.writeTextFile(picked, exportToHtml(tab.content, tab.title));
    s.showToast("HTML exported");
  } catch (e) {
    s.showToast(`Export failed: ${e}`);
  }
}

// ---------- file management (sidebar / tab context menus) ----------

const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";
const baseOf = (p: string) => p.split("/").pop() ?? p;

/** Rejects names that would move the entry somewhere else entirely. */
function invalidName(name: string): string | null {
  if (!name.trim()) return "Name can't be empty";
  if (name.includes("/")) return "Name can't contain “/”";
  if (name === "." || name === "..") return "That name is reserved";
  return null;
}

/** `notes.md` → `notes copy.md`, avoiding anything already in the folder. */
async function freeName(dir: string, name: string): Promise<string> {
  let taken = new Set<string>();
  try {
    taken = new Set((await backend.listDir(dir)).map((e) => e.name));
  } catch {
    /* an unreadable folder just means we can't dedupe */
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = `${stem} copy${ext}`;
  let n = 1;
  while (taken.has(candidate)) candidate = `${stem} copy ${++n}${ext}`;
  return candidate;
}

export async function renameEntry(path: string, isDir = false) {
  const s = useStore.getState();
  const current = baseOf(path);
  const name = await s.askName({
    title: isDir ? "Rename folder" : "Rename file",
    label: "New name",
    initial: current,
    confirmLabel: "Rename",
    selectBasename: !isDir,
  });
  if (name === null || name === current) return;
  const problem = invalidName(name);
  if (problem) return s.showToast(problem);
  // keep the original extension when the new name omits one, so a file
  // doesn't quietly stop being markdown
  const dot = current.lastIndexOf(".");
  const ext = dot > 0 ? current.slice(dot) : "";
  const final = !isDir && ext && !name.includes(".") ? `${name}${ext}` : name;
  const target = `${dirOf(path)}/${final}`;
  try {
    await backend.renamePath(path, target);
    s.pathRenamed(path, target);
    s.refreshTree();
  } catch (e) {
    s.showToast(String(e));
  }
}

export async function trashEntry(path: string, isDir = false) {
  const s = useStore.getState();
  const name = baseOf(path);
  const ok = window.confirm(
    `Move “${name}” to the Trash?` +
      (isDir ? "\n\nEverything inside it goes too." : "") +
      "\n\nYou can restore it from the Trash."
  );
  if (!ok) return;
  try {
    await backend.trashFiles([path]);
    s.pathRemoved(path);
    s.refreshTree();
    s.showToast(`Moved ${name} to Trash`);
  } catch (e) {
    s.showToast(`Couldn't move to Trash: ${e}`);
  }
}

export async function newFileIn(dir: string) {
  const s = useStore.getState();
  const name = await s.askName({
    title: "New file",
    label: "Name",
    initial: "Untitled.md",
    confirmLabel: "Create",
    selectBasename: true,
  });
  if (name === null) return;
  const problem = invalidName(name);
  if (problem) return s.showToast(problem);
  const path = `${dir}/${name.includes(".") ? name : `${name}.md`}`;
  try {
    await backend.createFile(path);
    s.refreshTree();
    await s.openPath(path);
  } catch (e) {
    s.showToast(String(e));
  }
}

export async function newFolderIn(dir: string) {
  const s = useStore.getState();
  const name = await s.askName({
    title: "New folder",
    label: "Name",
    initial: "New folder",
    confirmLabel: "Create",
  });
  if (name === null) return;
  const problem = invalidName(name);
  if (problem) return s.showToast(problem);
  try {
    await backend.createFolder(`${dir}/${name}`);
    s.refreshTree();
  } catch (e) {
    s.showToast(String(e));
  }
}

export async function duplicateEntry(path: string) {
  const s = useStore.getState();
  const dir = dirOf(path);
  try {
    const target = `${dir}/${await freeName(dir, baseOf(path))}`;
    await backend.copyFile(path, target);
    s.refreshTree();
    await s.openPath(target);
  } catch (e) {
    s.showToast(String(e));
  }
}

export async function revealEntry(path: string) {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch (e) {
    useStore.getState().showToast(String(e));
  }
}
