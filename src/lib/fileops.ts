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
