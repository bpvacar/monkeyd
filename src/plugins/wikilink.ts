/**
 * Preserves Obsidian-style wiki links through a round trip.
 *
 * remark escapes `[` when it serializes a text node, because a bracket can
 * start a link. `[[Computer Vision]]` is plain text as far as the editor is
 * concerned, so saving a note used to rewrite it as `\[\[Computer Vision]]` —
 * which Obsidian then renders as literal text instead of a link. One edit to a
 * note silently broke every link in it.
 *
 * Disabling bracket escaping globally would "fix" this and break real cases
 * like `[not a link]`, so instead wiki links become a node of their own: a
 * custom serializer handler writes the stored text verbatim, bypassing escapes,
 * and leaves every other bracket alone.
 *
 * This preserves; it does not resolve. Clicking a link does nothing, and
 * `![[image.png]]` is not rendered as an image — both are separate features.
 */
import { $node, $remark } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/prose/model";

/** `[[Target]]`, `[[Target|alias]]`, `![[embed.png]]`, `[[Target#heading]]`. */
const WIKILINK = /!?\[\[[^\]\n]+\]\]/g;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/**
 * Splits text nodes on wiki links. Only `text` nodes are visited, so anything
 * inside a code span or fenced block is left untouched — `` `[[x]]` `` stays
 * exactly that.
 */
function splitTextNodes(node: MdNode): void {
  if (!node.children) return;

  const out: MdNode[] = [];
  for (const child of node.children) {
    if (child.type !== "text" || typeof child.value !== "string") {
      splitTextNodes(child);
      out.push(child);
      continue;
    }

    const text = child.value;
    WIKILINK.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    let found = false;

    while ((m = WIKILINK.exec(text)) !== null) {
      found = true;
      if (m.index > last) {
        out.push({ type: "text", value: text.slice(last, m.index) });
      }
      out.push({ type: "wikiLink", value: m[0] });
      last = m.index + m[0].length;
    }

    if (!found) {
      out.push(child);
      continue;
    }
    if (last < text.length) {
      out.push({ type: "text", value: text.slice(last) });
    }
  }
  node.children = out;
}

export const remarkWikilinkPlugin = $remark("remarkWikilink", () =>
  // A plain function, not an arrow: `this` is the unified processor, which is
  // where the serializer extension has to be registered.
  function (this: {
    data: (k?: string) => Record<string, unknown> & {
      toMarkdownExtensions?: unknown[];
    };
  }) {
    const data = this.data();
    const extensions = (data.toMarkdownExtensions ??= []);
    // Without a handler for the node type we introduce, mdast-util-to-markdown
    // throws "Cannot handle unknown node". Returning the raw string here is
    // what skips escaping.
    extensions.push({
      handlers: {
        wikiLink: (node: { value?: string }) => node.value ?? "",
      },
    });

    return (tree: unknown) => {
      splitTextNodes(tree as MdNode);
    };
  }
);

/**
 * Holds the link exactly as written. An atom so the editor treats it as one
 * indivisible unit — without that, typing inside the brackets could produce
 * half a link that no longer round-trips.
 */
export const wikilinkNode = $node("wikilink", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { value: { default: "" } },
  parseDOM: [
    {
      tag: 'span[data-type="wikilink"]',
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).getAttribute("data-value") ?? "",
      }),
    },
  ],
  toDOM: (node: ProseNode) => [
    "span",
    {
      "data-type": "wikilink",
      "data-value": node.attrs.value as string,
      class: "wikilink",
    },
    node.attrs.value as string,
  ],
  parseMarkdown: {
    match: ({ type }) => type === "wikiLink",
    runner: (state, node, type) => {
      state.addNode(type, { value: (node.value as string) ?? "" });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "wikilink",
    // Written as a raw value, so remark's escaping never sees the brackets.
    runner: (state, node) => {
      state.addNode("wikiLink", undefined, node.attrs.value as string);
    },
  },
}));

export const wikilink = [remarkWikilinkPlugin, wikilinkNode].flat();
