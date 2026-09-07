import { useStore } from "../store";
import * as backend from "./backend";

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
export async function checkTabsAgainstDisk(): Promise<void> {
  const s = useStore.getState();
  for (const tab of s.tabs) {
    if (!tab.path || tab.conflict) continue;
    let stamp: string;
    try {
      stamp = await backend.fileStamp(tab.path);
    } catch {
      // deleted or unreachable; leave the tab alone rather than guess
      continue;
    }
    // a tab that has never been saved has nothing to compare against yet
    if (tab.diskStamp === null) {
      useStore.getState().setDiskStamp(tab.id, stamp);
      continue;
    }
    if (stamp === tab.diskStamp) continue;

    const dirty = tab.content !== tab.savedContent;
    if (dirty) {
      useStore.getState().setConflict(tab.id, true);
      continue;
    }
    try {
      const content = await backend.readTextFile(tab.path);
      // an outside write that produced identical text isn't worth a remount
      if (content === tab.content) {
        useStore.getState().setDiskStamp(tab.id, stamp);
        continue;
      }
      useStore.getState().applyExternalContent(tab.id, content, stamp);
      useStore.getState().showToast(`${tab.title} updated from disk`);
    } catch {
      /* unreadable right now; try again on the next check */
    }
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
    store.showToast(`Saved over the newer ${tab.title}`);
  } catch (e) {
    useStore.getState().showToast(`Save failed: ${e}`);
  }
}
