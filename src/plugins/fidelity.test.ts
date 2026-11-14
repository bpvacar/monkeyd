// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";
import { frontmatter } from "./frontmatter";
import { wikilink } from "./wikilink";
import { keepMarkdownAsWritten } from "./fidelity";
import sample from "../../SAMPLE.md?raw";

// jsdom lacks these; Crepe's code-block and image views construct them
const g = globalThis as Record<string, unknown>;
g.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

let open: Crepe[] = [];
afterEach(async () => {
  await Promise.all(open.map((c) => c.destroy()));
  open = [];
});

/** Opens markdown the way WysiwygEditor does: Crepe with every feature on. */
async function openRich(md: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const crepe = new Crepe({ root, defaultValue: md });
  crepe.editor.use(frontmatter).use(wikilink);
  keepMarkdownAsWritten(crepe.editor, md);
  await crepe.create();
  open.push(crepe);
  return {
    edit: (fn: (view: EditorView) => void) => crepe.editor.action((ctx) => fn(ctx.get(editorViewCtx))),
    markdown: () => crepe.editor.action(getMarkdown()),
  };
}

/** Document position of the first occurrence of `text`. */
function posOf(view: EditorView, text: string): number {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (at >= 0) return false;
    const i = node.isText ? node.text!.indexOf(text) : -1;
    if (i >= 0) at = pos + i;
  });
  if (at < 0) throw new Error(`"${text}" not in document`);
  return at;
}

test("SAMPLE.md comes back byte-identical", async () => {
  const doc = await openRich(sample);
  expect(doc.markdown()).toBe(sample);
});

test("toggling inline code on a word and back leaves the file untouched", async () => {
  const doc = await openRich(sample);
  doc.edit((view) => {
    const from = posOf(view, "exercises");
    const code = view.state.schema.marks.inlineCode.create();
    view.dispatch(view.state.tr.addMark(from, from + "exercises".length, code));
  });
  expect(doc.markdown()).toContain("`exercises`");
  doc.edit((view) => {
    const from = posOf(view, "exercises");
    view.dispatch(view.state.tr.removeMark(from, from + "exercises".length, view.state.schema.marks.inlineCode));
  });
  expect(doc.markdown()).toBe(sample);
});

test("typing a word changes only that span", async () => {
  const doc = await openRich(sample);
  doc.edit((view) => view.dispatch(view.state.tr.insertText("really ", posOf(view, "exercises"))));
  expect(doc.markdown()).toBe(sample.replace("exercises", "really exercises"));
});

test("image alt text and title survive", async () => {
  const md = "![a diagram of the pipeline](img/pipe.png)\n\n![](x.png \"caption\")\n";
  expect((await openRich(md)).markdown()).toBe(md);
});

test("Obsidian-style note: tight table, * bullets, *** break, 1) lists", async () => {
  const md = [
    "| Página | Qué es |",
    "|---|---:|",
    "| [[Computer Vision]] | MAC-5001 |",
    "| a \\| b | `x` |",
    "",
    "* uno",
    "* dos",
    "  * anidado",
    "",
    "1) primero",
    "2) segundo",
    "",
    "***",
    "",
    "Fin.",
    "",
  ].join("\n");
  expect((await openRich(md)).markdown()).toBe(md);
});

test("aligned tables stay aligned and loose lists stay loose", async () => {
  const md = [
    "| Feature     | Status |",
    "| :---------- | -----: |",
    "| Source mode |      ✓ |",
    "",
    "- loose one",
    "",
    "- loose two",
    "",
    "---",
    "",
    "Fin.",
    "",
  ].join("\n");
  expect((await openRich(md)).markdown()).toBe(md);
});
