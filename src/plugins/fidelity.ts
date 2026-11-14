/**
 * Keeps the user's markdown as written when the rich-text editor saves it.
 *
 * Rich mode re-serializes the whole document on every edit, so any difference
 * between how remark writes markdown and how the user wrote it shows up as a
 * rewrite of text nobody touched. Seen with a one-word edit to SAMPLE.md:
 *
 *   - `![placeholder](…)` became `![1.00](…)`: Crepe's image-block stores its
 *     aspect ratio in the alt text, destroying the real alt.
 *   - tight lists gained blank lines between items: Milkdown keeps the list
 *     `spread` flag as the *string* "false", and remark ignores a non-boolean
 *     spread and falls back to a blank line.
 *   - `-` bullets became `*`, `---` became `***`, and tables were padded into
 *     aligned columns: remark's defaults, not the document's style.
 *
 * The fixes: image-block keeps the alt (the ratio is no longer saved — markdown
 * has no size syntax, and the alt is the user's data), string spreads are read
 * as booleans, and the bullet, rule and table style are read from the document
 * when it opens and handed to the serializer.
 */
import { remarkStringifyOptionsCtx, type Editor } from "@milkdown/kit/core";
import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";

// Loose mdast/to-markdown shapes; the real types live in transitive deps.
interface MdNode {
  type: string;
  spread?: unknown;
  align?: (string | null)[] | null;
  children?: MdNode[];
}
interface ToMdState {
  enter(name: string): () => void;
  handlers: Record<string, (node: MdNode, parent: MdNode | undefined, state: ToMdState, info: unknown) => string>;
}

export interface MarkdownStyle {
  bullet: "-" | "*" | "+";
  bulletOrdered: "." | ")";
  rule: "-" | "*" | "_";
  ruleRepetition: number;
  ruleSpaces: boolean;
  /** `aligned` pads every column; otherwise `| a |` rows and `---` delimiters, with or without spaces around them. */
  table: "aligned" | "compact" | "compact-tight";
}

const DEFAULT_STYLE: MarkdownStyle = {
  bullet: "-",
  bulletOrdered: ".",
  rule: "-",
  ruleRepetition: 3,
  ruleSpaces: false,
  table: "compact",
};

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BULLET = /^[ \t]*(?:>[ \t]?)*([-*+])[ \t]+\S/;
const ORDERED = /^[ \t]*(?:>[ \t]?)*\d{1,9}([.)])[ \t]+\S/;
const DELIM_ROW = /^ {0,3}\|?(?:[ \t]*:?-+:?[ \t]*\|)+(?:[ \t]*:?-+:?[ \t]*)?$/;

/**
 * Reads the style the document already uses, first occurrence wins. Line-based
 * and approximate on purpose: a miss only means falling back to the default.
 */
export function detectStyle(markdown: string): MarkdownStyle {
  const style = { ...DEFAULT_STYLE };
  const seen = new Set<string>();
  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;
  let start = 0;
  // front matter's `---` fences are not thematic breaks
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) start = end + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const rule = RULE.exec(line);
    // `---` under a paragraph line is a setext heading, not a break
    if (rule && (prevBlank || rule[1] !== "-")) {
      if (!seen.has("rule")) {
        seen.add("rule");
        const chars = line.trim();
        style.rule = rule[1] as MarkdownStyle["rule"];
        style.ruleRepetition = chars.split(rule[1]).length - 1;
        style.ruleSpaces = /\s/.test(chars);
      }
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet && !seen.has("bullet")) {
      seen.add("bullet");
      style.bullet = bullet[1] as MarkdownStyle["bullet"];
    }
    const ordered = ORDERED.exec(line);
    if (ordered && !seen.has("ordered")) {
      seen.add("ordered");
      style.bulletOrdered = ordered[1] as MarkdownStyle["bulletOrdered"];
    }
    if (DELIM_ROW.test(line) && line.includes("|") && !seen.has("table")) {
      seen.add("table");
      const cells = line.trim().replace(/^\||\|$/g, "").split("|");
      const compact = cells.every((c) => /^\s?:?-{3}:?\s?$/.test(c));
      style.table = !compact ? "aligned" : cells.every((c) => !/\s/.test(c)) ? "compact-tight" : "compact";
    }
  }
  return style;
}

/**
 * GFM table writer for unaligned tables: `| a | b |` rows and a `---`
 * delimiter per column. remark-gfm only offers aligned columns or a single `-`.
 * Cell contents still go through remark-gfm's tableCell handler, so pipes and
 * newlines are escaped exactly as before.
 */
function compactTable(tight: boolean) {
  return (node: MdNode, _parent: MdNode | undefined, state: ToMdState, info: unknown) => {
    const exitTable = state.enter("table");
    const rows = (node.children ?? []).map((row) => {
      const exitRow = state.enter("tableRow");
      const cells = (row.children ?? []).map((cell) => state.handlers.tableCell(cell, row, state, info));
      exitRow();
      return cells;
    });
    exitTable();
    const align = node.align ?? [];
    const cols = Math.max(align.length, ...rows.map((r) => r.length));
    const line = (cells: string[]) =>
      "|" + Array.from({ length: cols }, (_, i) => (cells[i] ? ` ${cells[i]} ` : " ")).join("|") + "|";
    const delims = Array.from({ length: cols }, (_, i) => {
      const a = align[i];
      return (a === "left" || a === "center" ? ":" : "") + "---" + (a === "right" || a === "center" ? ":" : "");
    });
    const delim = tight ? `|${delims.join("|")}|` : `| ${delims.join(" | ")} |`;
    return [line(rows[0] ?? []), delim, ...rows.slice(1).map(line)].join("\n");
  };
}

/** Milkdown stores list `spread` as "true"/"false"; remark only honours booleans. */
function joinStringSpread(left: MdNode, right: MdNode, parent: MdNode) {
  if (typeof parent.spread !== "string") return undefined;
  // same rule remark applies to a boolean spread
  if (left.type === "paragraph" && (right.type === "paragraph" || right.type === "definition")) return undefined;
  return parent.spread === "true" ? 1 : 0;
}

/** Crepe's image-block, but the alt text is the alt text. */
const imageBlockKeepsAlt = imageBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, alt: { default: "", validate: "string" } },
    parseDOM: base.parseDOM?.map((rule) => ({
      ...rule,
      getAttrs: (dom: HTMLElement) => {
        const attrs = typeof rule.getAttrs === "function" ? rule.getAttrs(dom) : {};
        return attrs && { ...attrs, alt: dom.getAttribute("alt") ?? "" };
      },
    })),
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state, node, type) => {
        state.addNode(type, {
          src: node.url as string,
          caption: (node.title as string | null) ?? "",
          alt: (node.alt as string | null) ?? "",
        });
      },
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        state.openNode("paragraph");
        state.addNode("image", undefined, undefined, {
          title: node.attrs.caption || null,
          url: node.attrs.src,
          alt: node.attrs.alt,
        });
        state.closeNode();
      },
    },
  };
});

/**
 * Wires all of the above into an editor that will open `markdown`. Call after
 * Crepe is constructed (its image-block must already be registered, so this
 * one replaces it) and before `create()`.
 */
export function keepMarkdownAsWritten(editor: Editor, markdown: string): Editor {
  const style = detectStyle(markdown);
  return editor
    .config((ctx) => {
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: style.bullet,
        bulletOrdered: style.bulletOrdered,
        rule: style.rule,
        ruleRepetition: style.ruleRepetition,
        ruleSpaces: style.ruleSpaces,
        join: [...(prev.join ?? []), joinStringSpread as never],
        handlers:
          style.table === "aligned"
            ? prev.handlers
            : { ...prev.handlers, table: compactTable(style.table === "compact-tight") as never },
      }));
    })
    .use(imageBlockKeepsAlt as MilkdownPlugin[]);
}
