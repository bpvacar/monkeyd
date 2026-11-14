import type { Node } from "@milkdown/kit/prose/model";

export interface Match {
  from: number;
  to: number;
}

/** What the find bar drives; the mounted editor registers one in the store. */
export interface FindTarget {
  matches(query: string): Match[];
  selection(): Match;
  /** Highlights every match and selects `current` in the editor. */
  show(query: string, matches: Match[], current: Match | undefined): void;
  /** Drops the highlights and hands focus back, the last match still selected. */
  close(): void;
  selectedText(): string;
  /** Replaces every given match in one undoable step; the cursor ends after the last. */
  replace(matches: Match[], text: string): void;
}

/** 0 = from the cursor (typing), 1 = next, -1 = previous. */
export type FindDir = 0 | 1 | -1;
/** A step, "selection" for ⌘E (Use Selection for Find), or "replace" for ⌥⌘F. */
export type FindCommand = FindDir | "selection" | "replace";

export const findCommand = (cmd: FindCommand) =>
  window.dispatchEvent(new CustomEvent<FindCommand>("find", { detail: cmd }));

/** Index of the match to select relative to the selection, wrapping; -1 if none. */
export function pickMatch(ms: Match[], sel: Match, dir: FindDir): number {
  if (!ms.length) return -1;
  if (dir === -1) {
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].to <= sel.from) return i;
    return ms.length - 1;
  }
  const at = dir === 0 ? sel.from : sel.to;
  const i = ms.findIndex((m) => m.from >= at);
  return i === -1 ? 0 : i;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive matches in a ProseMirror doc, found across bold/links/etc. */
export function findInDoc(doc: Node, query: string): Match[] {
  const out: Match[] = [];
  if (!query) return out;
  const re = new RegExp(escapeRe(query), "gi");
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // inline leaves (images, breaks) count as one char, so offsets map 1:1 to positions
    const text = node.textBetween(0, node.content.size, undefined, "￼");
    for (const m of text.matchAll(re)) {
      const from = pos + 1 + m.index;
      out.push({ from, to: from + m[0].length });
    }
    return false;
  });
  return out;
}
