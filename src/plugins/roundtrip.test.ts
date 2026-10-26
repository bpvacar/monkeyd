// @vitest-environment jsdom
import { expect, test } from "vitest";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { frontmatter } from "./frontmatter";
import { wikilink } from "./wikilink";

/** Opens markdown in the rich-text editor and serializes it straight back. */
async function roundTrip(md: string): Promise<string> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.body);
      ctx.set(defaultValueCtx, md);
    })
    .use(commonmark)
    .use(gfm)
    .use(frontmatter)
    .use(wikilink)
    .create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

test("an Obsidian note survives the rich-text editor unchanged", async () => {
  const note = [
    "---",
    "tags: [idea, código]",
    "---",
    "",
    "> [!note]- Título del callout",
    "> cuerpo",
    "",
    "#idea al inicio, #código en medio, [[Página|alias]] y ![[Pasted image.png]]",
    "",
    "#solo un tag al inicio de línea",
    "",
  ].join("\n");
  expect(await roundTrip(note)).toBe(note);
});
