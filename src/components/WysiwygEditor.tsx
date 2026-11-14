import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { toggleInlineCodeCommand } from "@milkdown/kit/preset/commonmark";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import {
  imageFromClipboard,
  resolveImageSrc,
  savePastedImage,
} from "../lib/attachments";
import { frontmatter } from "../plugins/frontmatter";
import { wikilink } from "../plugins/wikilink";
import { useStore } from "../store";
import { findInDoc, type FindTarget } from "../lib/find";

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
        // plain inline image, not Crepe's image-block: the latter encodes its
        // aspect ratio into the alt text, which would leak into the markdown
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

    let destroyed = false;
    let findTarget: FindTarget | null = null;
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
          useStore.getState().setFindTarget(findTarget);
        });
      })
      .catch((e) => console.error("crepe mount failed", e));
    return () => {
      root.removeEventListener("paste", onPaste, true);
      const s = useStore.getState();
      if (findTarget && s.findTarget === findTarget) s.setFindTarget(null);
      if (!destroyed) {
        destroyed = true;
        crepe.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="wysiwyg-root" />;
}
