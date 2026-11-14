import { setRecent } from "./backend";

const KEY = "recentFiles";
const MAX = 10;

export function recentFiles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Fills File ▸ Open Recent; `path` goes to the top. */
export function rememberRecent(path?: string) {
  const list = path ? [path, ...recentFiles().filter((p) => p !== path)].slice(0, MAX) : recentFiles();
  localStorage.setItem(KEY, JSON.stringify(list));
  setRecent(list).catch(() => {});
}

export function clearRecent() {
  localStorage.setItem(KEY, "[]");
  setRecent([]).catch(() => {});
}
