import { expect, test } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { findInDoc, pickMatch } from "./find";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    image: { group: "inline", inline: true },
  },
  marks: { strong: {} },
});

test("finds matches across marks and after inline leaves, ignoring case", () => {
  const { paragraph, image } = schema.nodes;
  const doc = schema.node("doc", null, [
    paragraph.create(null, [schema.text("x"), image.create(), schema.text("Monkey")]),
    paragraph.create(null, [schema.text("mon"), schema.text("key D", [schema.marks.strong.create()])]),
  ]);
  const ms = findInDoc(doc, "monkey");
  expect(ms).toHaveLength(2);
  for (const m of ms) expect(doc.textBetween(m.from, m.to).toLowerCase()).toBe("monkey");
  expect(findInDoc(doc, "a.b")).toEqual([]); // regex chars are literal
});

test("picks matches relative to the selection and wraps", () => {
  const ms = [{ from: 0, to: 2 }, { from: 5, to: 7 }, { from: 9, to: 11 }];
  expect(pickMatch(ms, { from: 5, to: 7 }, 0)).toBe(1); // typing keeps the current match
  expect(pickMatch(ms, { from: 5, to: 7 }, 1)).toBe(2);
  expect(pickMatch(ms, { from: 9, to: 11 }, 1)).toBe(0);
  expect(pickMatch(ms, { from: 5, to: 7 }, -1)).toBe(0);
  expect(pickMatch(ms, { from: 0, to: 2 }, -1)).toBe(2);
  expect(pickMatch([], { from: 0, to: 0 }, 1)).toBe(-1);
});
