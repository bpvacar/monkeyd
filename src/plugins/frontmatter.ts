/**
 * YAML front matter support for the rich-text editor.
 *
 * Without this, remark reads the opening `---` as a thematic break and the
 * closing one as a setext-heading underline, so a round trip through the
 * editor rewrites the block as `***` + `----------` and the metadata is lost.
 * Every Obsidian vault puts front matter at the top of its notes, so opening
 * one and letting autosave fire used to corrupt it.
 *
 * Two pieces are needed:
 *   1. `remark-frontmatter`, so the markdown parses to a `yaml` mdast node.
 *   2. A ProseMirror node to hold it — an mdast node with no matching prose
 *      node is dropped on the way in, which loses the data just as thoroughly.
 */
import { $node, $remark } from "@milkdown/kit/utils";
import remarkFrontmatter from "remark-frontmatter";

/** Parses `---\n…\n---` at the top of a document into a `yaml` mdast node. */
export const remarkFrontmatterPlugin = $remark(
  "remarkFrontmatter",
  () => remarkFrontmatter
);

/**
 * Holds the raw YAML. Kept as literal text — the editor shows it, it isn't
 * interpreted. `code: true` stops input rules and marks from rewriting the
 * contents, which would otherwise mangle the YAML as you type near it.
 */
export const frontmatterNode = $node("frontmatter", () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  attrs: {},
  parseDOM: [
    {
      tag: 'div[data-type="frontmatter"]',
      preserveWhitespace: "full" as const,
    },
  ],
  toDOM: () => [
    "div",
    { "data-type": "frontmatter", class: "frontmatter" },
    0,
  ],
  parseMarkdown: {
    match: ({ type }) => type === "yaml",
    runner: (state, node, type) => {
      const value = typeof node.value === "string" ? node.value : "";
      state.openNode(type);
      if (value) state.addText(value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "frontmatter",
    // `addNode(type, children, value)` — the value is emitted verbatim between
    // the `---` fences by mdast-util-frontmatter.
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.textContent);
    },
  },
}));

export const frontmatter = [remarkFrontmatterPlugin, frontmatterNode].flat();
