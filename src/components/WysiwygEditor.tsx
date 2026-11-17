import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import {
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import { linkTooltipAPI } from "@milkdown/kit/component/link-tooltip";
import { lift } from "@milkdown/kit/prose/commands";
import type { Ctx } from "@milkdown/kit/ctx";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin, PluginKey, Selection, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import {
  imageFromClipboard,
  imagesFromDrop,
  isFileDrag,
  resolveImageSrc,
  saveDroppedImages,
  savePastedImage,
} from "../lib/attachments";
import { frontmatter } from "../plugins/frontmatter";
import { keepMarkdownAsWritten } from "../plugins/fidelity";
import { wikilink } from "../plugins/wikilink";
import { useStore } from "../store";
import { findInDoc, type FindTarget } from "../lib/find";
import type { FormatTarget } from "../lib/format";

/** Format menu in rich text: Milkdown's own commands, so marks and undo behave as typed. */
function formatTargetFor(ctx: Ctx): FormatTarget {
  return (f) => {
    const view = ctx.get(editorViewCtx);
    const commands = ctx.get(commandsCtx);
    if (f === "bold") commands.call(toggleStrongCommand.key);
    else if (f === "italic") commands.call(toggleEmphasisCommand.key);
    else if (f === "code") commands.call(toggleInlineCodeCommand.key);
    else if (f === "link") {
      const { from, empty } = view.state.selection;
      let { to } = view.state.selection;
      if (empty) {
        view.dispatch(view.state.tr.insertText("link", from));
        to = from + 4;
      }
      ctx.get(linkTooltipAPI.key).addLink(from, to);
      return;
    } else if (f === "quote") {
      const { $from } = view.state.selection;
      let inQuote = false;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "blockquote") inQuote = true;
      if (inQuote) lift(view.state, view.dispatch);
      else commands.call(wrapInBlockquoteCommand.key);
    } else {
      const level = Number(f.slice(1));
      const block = view.state.selection.$from.parent;
      const same = block.type.name === "heading" && block.attrs.level === level;
      commands.call(wrapInHeadingCommand.key, same ? 0 : level);
    }
    view.focus();
  };
}

/**
 * The document position under a point, as Google Docs picks it: a point in the
 * margin or below the text snaps to the nearest line, so a drop anywhere on
 * the page lands somewhere sensible.
 */
function dropPosAt(view: EditorView, x: number, y: number): Selection | null {
  const r = view.dom.getBoundingClientRect();
  const left = Math.min(Math.max(x, r.left + 1), r.right - 1);
  const top = Math.min(Math.max(y, r.top + 1), r.bottom - 1);
  const hit = view.posAtCoords({ left, top });
  return hit ? Selection.near(view.state.doc.resolve(hit.pos)) : null;
}

/** Find matches as decorations, so they follow edits and WebKit repaints them. */
const findKey = new PluginKey<DecorationSet>("find");
const findPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: findKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, deco) => tr.getMeta(findKey) ?? deco.map(tr.mapping, tr.doc),
      },
      props: { decorations: (state) => findKey.getState(state) },
    })
);

/** ⌘/ = inline code, the rich-text twin of CodeMirror's ⌘/ comment (⌘E is the Mac's Use Selection for Find). */
const inlineCodeKey = $prose((ctx) =>
  keymap({ "Mod-/": () => ctx.get(commandsCtx).call(toggleInlineCodeCommand.key) })
);

function findTargetFor(view: EditorView): FindTarget {
  return {
    matches: (q) => findInDoc(view.state.doc, q),
    selection: () => view.state.selection,
    selectedText: () => {
      const { from, to } = view.state.selection;
      return view.state.doc.textBetween(from, to, " ");
    },
    show(_q, ms, cur) {
      const { doc } = view.state;
      const deco = DecorationSet.create(
        doc,
        ms.map((m) => Decoration.inline(m.from, m.to, { class: m === cur ? "find-match current" : "find-match" }))
      );
      const tr = view.state.tr.setMeta(findKey, deco);
      if (cur) tr.setSelection(TextSelection.create(doc, cur.from, cur.to));
      view.dispatch(tr);
      if (!cur) return;
      // ProseMirror scrolls from wherever focus is (the find input), so scroll the page ourselves
      const host = view.dom.closest(".editor-host");
      const at = view.coordsAtPos(cur.from);
      const box = host?.getBoundingClientRect();
      if (host && box && (at.top < box.top || at.bottom > box.bottom)) {
        host.scrollTop += at.top - box.top - box.height / 3;
      }
    },
    close() {
      view.dispatch(view.state.tr.setMeta(findKey, DecorationSet.empty));
      view.focus();
    },
    replace(ms, text) {
      if (!ms.length) return;
      const tr = view.state.tr;
      for (const m of [...ms].reverse()) tr.insertText(text, m.from, m.to);
      const end = tr.mapping.map(ms[ms.length - 1].to);
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)));
    },
  };
}

interface Props {
  /** Content the editor was mounted with; changes remount via key upstream. */
  initialContent: string;
  onChange: (markdown: string) => void;
}

export default function WysiwygEditor({ initialContent, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const crepe = new Crepe({
      root,
      defaultValue: initialContent,
      featureConfigs: {
        // render local images through the asset protocol; the markdown keeps
        // its relative path
        [Crepe.Feature.ImageBlock]: { proxyDomURL: resolveImageSrc },
      },
    });
    // Front matter and wiki links must round-trip untouched — without these,
    // saving a note rewrites its metadata and escapes every [[link]].
    crepe.editor.use(frontmatter);
    crepe.editor.use(wikilink);
    // every edit re-serializes the whole file: keep its alt texts, bullets,
    // breaks and tables the way the user wrote them
    keepMarkdownAsWritten(crepe.editor, initialContent);
    crepe.editor.use(findPlugin);
    crepe.editor.use(inlineCodeKey);

    // macOS text substitution rewrites what you type — "abcd" arrives as
    // "Abd" — and its suggestion bubble draws over the row below, which in a
    // table reads as a phantom new row. Notes are Spanish with English
    // technical terms; system autocorrect is wrong for both.
    crepe.editor.config((ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        attributes: {
          ...(typeof prev.attributes === "object" ? prev.attributes : {}),
          autocorrect: "off",
          autocapitalize: "off",
          autocomplete: "off",
          spellcheck: "false",
          "aria-label": "Document",
        },
      }));
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prev) => {
        if (markdown !== prev) onChangeRef.current(markdown);
      });
    });

    /** Puts an image at the cursor, as a node so it renders like any other. */
    const insertImage = (src: string, fallback: string) => {
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        // plain inline image, so a pasted screenshot stays inline with the text
        const type =
          state.schema.nodes.image ?? state.schema.nodes["image-block"];
        try {
          if (!type) throw new Error("no image node in schema");
          view.dispatch(
            state.tr.replaceSelectionWith(type.create({ src, alt: "" }))
          );
        } catch {
          // last resort: raw markdown, which the serializer round-trips fine
          view.dispatch(view.state.tr.insertText(fallback));
        }
        view.focus();
      });
    };

    // Crepe has its own image paste handling that would turn the screenshot
    // into a data URI, so intercept in the capture phase before it sees it.
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      savePastedImage(file).then((saved) => {
        if (saved) insertImage(saved.src, saved.markdown);
      });
    };
    root.addEventListener("paste", onPaste, true);

    // Images dragged in from Finder go where they're dropped, with a caret
    // following the pointer meanwhile. Capture phase again: Crepe's upload
    // plugin would store them as blob: URLs that die with the window, and its
    // block-level drop line can't show a spot inside a sentence.
    const host = (root.closest(".editor-host") as HTMLElement | null) ?? root;
    const caret = document.createElement("div");
    caret.className = "drop-caret";
    caret.hidden = true;
    host.appendChild(caret);
    let hideTimer = 0;
    const viewOrNull = (): EditorView | null => {
      try {
        return crepe.editor.action((ctx) => ctx.get(editorViewCtx));
      } catch {
        return null; // not mounted yet
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer!.dropEffect = "copy";
      const view = viewOrNull();
      const sel = view && dropPosAt(view, event.clientX, event.clientY);
      if (view && sel) {
        const at = view.coordsAtPos(sel.from);
        Object.assign(caret.style, {
          left: `${at.left}px`,
          top: `${at.top}px`,
          height: `${Math.max(at.bottom - at.top, 16)}px`,
        });
        caret.hidden = false;
      }
      // dragover repeats while the pointer is over the page; when it stops
      // coming the drag has left (WebKit's dragleave fires between children)
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => (caret.hidden = true), 150);
    };
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      caret.hidden = true;
      const files = imagesFromDrop(event.dataTransfer);
      if (!files.length) {
        useStore.getState().showToast("Only images can be dropped into a document");
        return;
      }
      const view = viewOrNull();
      const sel = view && dropPosAt(view, event.clientX, event.clientY);
      if (!view || !sel) return;
      // the caret moves to the drop point at once; the images follow when saved
      view.dispatch(view.state.tr.setSelection(sel));
      view.focus();
      saveDroppedImages(files).then((saved) => {
        for (const one of saved) insertImage(one.src, one.markdown);
      });
    };
    host.addEventListener("dragover", onDragOver, true);
    host.addEventListener("drop", onDrop, true);

    let destroyed = false;
    let findTarget: FindTarget | null = null;
    let formatTarget: FormatTarget | null = null;
    crepe
      .create()
      // focus on mount so typing (and ⌘V) land in the document straight away,
      // matching the source editor's behaviour
      .then(() => {
        if (destroyed) return;
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          view.focus();
          findTarget = findTargetFor(view);
          formatTarget = formatTargetFor(ctx);
          useStore.getState().setFindTarget(findTarget);
          useStore.getState().setFormatTarget(formatTarget);
        });
      })
      .catch((e) => console.error("crepe mount failed", e));
    return () => {
      root.removeEventListener("paste", onPaste, true);
      host.removeEventListener("dragover", onDragOver, true);
      host.removeEventListener("drop", onDrop, true);
      window.clearTimeout(hideTimer);
      caret.remove();
      const s = useStore.getState();
      if (findTarget && s.findTarget === findTarget) s.setFindTarget(null);
      if (formatTarget && s.formatTarget === formatTarget) s.setFormatTarget(null);
      if (!destroyed) {
        destroyed = true;
        crepe.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="wysiwyg-root" />;
}
