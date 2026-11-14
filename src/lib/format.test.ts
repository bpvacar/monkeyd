import { expect, test } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { formatSource, type Format } from "./format";

/** Runs a Format command on `doc` with [from, to) selected; returns the text and selection. */
function run(doc: string, from: number, to: number, f: Format) {
  const state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  const next = state.update(formatSource(state, f)).state;
  const { from: a, to: b } = next.selection.main;
  return [next.doc.toString(), next.sliceDoc(a, b)];
}

test("inline marks wrap the selection and toggle back off", () => {
  expect(run("say hi", 4, 6, "bold")).toEqual(["say **hi**", "hi"]);
  expect(run("say **hi**", 6, 8, "bold")).toEqual(["say hi", "hi"]);
  expect(run("a b", 2, 3, "code")).toEqual(["a `b`", "b"]);
});

test("link wraps the text and selects the url placeholder", () => {
  expect(run("see docs", 4, 8, "link")).toEqual(["see [docs](url)", "url"]);
  expect(run("", 0, 0, "link")).toEqual(["[link](url)", "url"]);
});

test("headings set, replace and toggle the level of every touched line", () => {
  expect(run("Title", 0, 0, "h2")[0]).toBe("## Title");
  expect(run("### Title", 0, 0, "h1")[0]).toBe("# Title");
  expect(run("## Title", 0, 0, "h2")[0]).toBe("Title");
});

test("quote toggles on all selected lines", () => {
  expect(run("a\nb", 0, 3, "quote")[0]).toBe("> a\n> b");
  expect(run("> a\n> b", 0, 7, "quote")[0]).toBe("a\nb");
});
