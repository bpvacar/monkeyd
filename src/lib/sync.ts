import { useStore } from "../store";
import * as backend from "./backend";
import { notifySave } from "../plugins/runtime";

/**
 * Keeps open tabs honest about what's on disk.
 *
 * Files here are edited by more than this app — an agent rewriting a note, a
 * git checkout, Obsidian on the same vault. Without this, the first keystroke
 * after an outside edit triggers autosave and silently overwrites it.
 *
 * A tab with no unsaved edits just picks up the new text. A tab with unsaved
 * edits is marked `conflict`, which blocks autosave and shows a bar asking
 * what to do — nothing is discarded without an answer.
 */
let checking = false;

export async function checkTabsAgainstDisk(): Promise<void> {
  // focus and visibilitychange fire together; one pass at a time
  if (checking) return;
  checking = true;
  try {
    for (const { id } of useStore.getState().tabs) await checkTab(id);
  } finally {
    checking = false;
  }
}

/**
 * The tab is read fresh after every await: an autosave can finish in between,
 * and judging by the old copy would flag our own write as someone else's.
 */
async function checkTab(id: string): Promise<void> {
  const current = () => useStore.getState().tabs.find((t) => t.id === id);
  const path = current()?.path;
  if (!path || current()?.conflict) return;
  let stamp: string;
  try {
    stamp = await backend.fileStamp(path);
  } catch {
    // deleted or unreachable; leave the tab alone rather than guess
    return;
  }
  const tab = current();
  if (!tab || tab.path !== path || tab.conflict) return;
  // a tab that has never been saved has nothing to compare against yet
  if (tab.diskStamp === null) {
    useStore.getState().setDiskStamp(id, stamp);
    return;
  }
  if (stamp === tab.diskStamp) return;

  if (tab.content !== tab.savedContent) {
    useStore.getState().setConflict(id, true);
    return;
  }
  try {
    const content = await backend.readTextFile(path);
    const now = current();
    if (!now || now.path !== path) return;
    // typed while we were reading: those edits now conflict with the file
    if (now.content !== now.savedContent) {
      useStore.getState().setConflict(id, true);
      return;
    }
    // an outside write that produced identical text isn't worth a remount
    if (content === now.content) {
      useStore.getState().setDiskStamp(id, stamp);
      return;
    }
    useStore.getState().applyExternalContent(id, content, stamp);
    useStore.getState().showToast(`${now.title} updated from disk`);
  } catch {
    /* unreadable right now; try again on the next check */
  }
}

/** Conflict resolution: take what's on disk, dropping this tab's edits. */
export async function reloadFromDisk(tabId: string): Promise<void> {
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return;
  try {
    const content = await backend.readTextFile(tab.path);
    const stamp = await backend.fileStamp(tab.path);
    useStore.getState().applyExternalContent(tab.id, content, stamp);
    useStore.getState().showToast(`Reloaded ${tab.title}`);
  } catch (e) {
    useStore.getState().showToast(String(e));
  }
}

/** Conflict resolution: keep this tab's text and overwrite the file. */
export async function overwriteOnDisk(tabId: string): Promise<void> {
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return;
  try {
    const stamp = await backend.writeTextFile(tab.path, tab.content);
    const store = useStore.getState();
    store.markSaved(tab.id, tab.content);
    store.setDiskStamp(tab.id, stamp);
    store.setConflict(tab.id, false);
    notifySave(tab.path, tab.content);
    store.showToast(`Saved over the newer ${tab.title}`);
  } catch (e) {
    useStore.getState().showToast(`Save failed: ${e}`);
  }
}
