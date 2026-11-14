import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { dirOf, explain, fileName as baseOf, useStore } from "../store";
import { notifySave } from "../plugins/runtime";
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

export const saveActiveTab = (): Promise<boolean> => {
  const id = useStore.getState().activeTabId;
  return id ? saveTab(id) : Promise.resolve(false);
};

/** `as` = Save As…: always ask where, and write there as a new file. */
export async function saveTab(id: string, as = false): Promise<boolean> {
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.id === id);
  if (!tab) return false;
  let path = tab.path;
  const picking = !path || as;
  if (picking) {
    const picked = await save({
      filters: MD_FILTER,
      defaultPath: tab.path ?? (tab.title.endsWith(".md") ? tab.title : `${tab.title}.md`),
    });
    if (!picked) return false;
    path = picked;
    s.setTabPath(tab.id, path);
  }
  if (!path) return false;
  // Refuse to write over an edit made outside the app. The tab is flagged
  // instead, and the conflict bar asks which version wins. A path just picked
  // in the save panel was already confirmed there.
  if (!picking && tab.diskStamp !== null) {
    const current = await backend.fileStamp(path).catch(() => null);
    if (current !== null && current !== tab.diskStamp) {
      s.setConflict(tab.id, true);
      return false;
    }
  }
  try {
    const stamp = await backend.writeTextFile(path, tab.content);
    s.markSaved(tab.id, tab.content);
    s.setDiskStamp(tab.id, stamp);
    notifySave(path, tab.content);
    return true;
  } catch (e) {
    s.showToast(`Couldn't save “${baseOf(path)}”. ${explain(e)}`, "error", {
      label: "Save As…",
      run: () => saveTab(id, true),
    });
    return false;
  }
}

/**
 * The macOS question before a tab with unsaved changes goes away: Save is the
 * default (Return), Cancel answers Esc. Returns false when the tab must stay.
 */
export async function settleUnsaved(id: string): Promise<boolean> {
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.id === id);
  if (!tab || tab.content === tab.savedContent) return true;
  s.setActive(id);
  const choice = await message("Your changes will be lost if you don't save them.", {
    title: `Do you want to save the changes you made to “${tab.title}”?`,
    kind: "warning",
    buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
  });
  if (choice === "Save" || choice === "Yes") return saveTab(id);
  return choice === "Don't Save" || choice === "No";
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
    s.showToast(`Couldn't export “${baseOf(picked)}”. ${explain(e)}`, "error");
  }
}

// ---------- file management (sidebar / tab context menus) ----------

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
  if (problem) return s.showToast(problem, "error");
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
    s.showToast(`Couldn't rename “${current}”. ${explain(e)}`, "error");
  }
}

export async function trashEntry(path: string, isDir = false) {
  const s = useStore.getState();
  const name = baseOf(path);
  const ok = await ask(
    `Move “${name}” to the Trash?` +
      (isDir ? "\n\nEverything inside it goes too." : "") +
      "\n\nYou can restore it from the Trash.",
    { kind: "warning", okLabel: "Move to Trash", cancelLabel: "Cancel" }
  );
  if (!ok) return;
  try {
    await backend.trashFiles([path]);
    s.pathRemoved(path);
    s.refreshTree();
    s.showToast(`Moved ${name} to Trash`);
  } catch (e) {
    s.showToast(`Couldn't move “${name}” to the Trash. ${explain(e)}`, "error");
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
  if (problem) return s.showToast(problem, "error");
  const path = `${dir}/${name.includes(".") ? name : `${name}.md`}`;
  try {
    await backend.createFile(path);
    s.refreshTree();
    await s.openPath(path);
  } catch (e) {
    s.showToast(`Couldn't create “${name}”. ${explain(e)}`, "error");
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
  if (problem) return s.showToast(problem, "error");
  try {
    await backend.createFolder(`${dir}/${name}`);
    s.refreshTree();
  } catch (e) {
    s.showToast(`Couldn't create the folder “${name}”. ${explain(e)}`, "error");
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
    s.showToast(`Couldn't duplicate “${baseOf(path)}”. ${explain(e)}`, "error");
  }
}

export async function revealEntry(path: string) {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch (e) {
    useStore.getState().showToast(`Couldn't show “${baseOf(path)}” in Finder. ${explain(e)}`, "error");
  }
}
