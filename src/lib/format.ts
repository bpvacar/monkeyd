import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

export type Format = "bold" | "italic" | "code" | "link" | "quote" | `h${1 | 2 | 3 | 4 | 5 | 6}`;

/** Applies a Format menu command to whichever editor is mounted (registered in the store). */
export type FormatTarget = (f: Format) => void;

const MARKS = { bold: "**", italic: "*", code: "`" } as const;

/** Markdown-source version of each Format command, as a CodeMirror transaction. */
export function formatSource(state: EditorState, f: Format): TransactionSpec {
  if (f === "bold" || f === "italic" || f === "code") {
    const m = MARKS[f];
    return state.changeByRange((r) => {
      // already wrapped right around the selection → unwrap
      if (state.sliceDoc(r.from - m.length, r.from) === m && state.sliceDoc(r.to, r.to + m.length) === m) {
        return {
          changes: [
            { from: r.from - m.length, to: r.from },
            { from: r.to, to: r.to + m.length },
          ],
          range: EditorSelection.range(r.from - m.length, r.to - m.length),
        };
      }
      return {
        changes: [
          { from: r.from, insert: m },
          { from: r.to, insert: m },
        ],
        range: EditorSelection.range(r.from + m.length, r.to + m.length),
      };
    });
  }
  if (f === "link") {
    return state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to) || "link";
      const insert = `[${text}](url)`;
      const url = r.from + text.length + 3;
      return {
        changes: { from: r.from, to: r.to, insert },
        range: EditorSelection.range(url, url + 3), // "url" selected, ready to paste over
      };
    });
  }
  // block formats act on every line the selection touches
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const ls = [...lines].map((n) => state.doc.line(n));
  if (f === "quote") {
    const quoted = ls.every((l) => l.text.startsWith(">"));
    return {
      changes: ls.map((l) =>
        quoted
          ? { from: l.from, to: l.from + (l.text.startsWith("> ") ? 2 : 1) }
          : { from: l.from, insert: "> " }
      ),
    };
  }
  const level = Number(f.slice(1));
  return {
    changes: ls.map((l) => {
      const current = /^(#{1,6})\s+/.exec(l.text);
      const prefix = current?.[1].length === level ? "" : "#".repeat(level) + " ";
      return { from: l.from, to: l.from + (current?.[0].length ?? 0), insert: prefix };
    }),
  };
}
