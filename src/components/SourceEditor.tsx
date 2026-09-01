import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, drawSelection, highlightSpecialChars } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { imageFromClipboard, savePastedImage } from "../lib/attachments";

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700", color: "var(--ink)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--accent)" },
  { tag: tags.monospace, color: "var(--accent)" },
  { tag: tags.quote, color: "var(--ink-muted)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--ink-faint)" },
  { tag: tags.processingInstruction, color: "var(--ink-faint)" },
  { tag: tags.labelName, color: "var(--ink-muted)" },
]);

interface Props {
  initialContent: string;
  onChange: (markdown: string) => void;
}

export default function SourceEditor({ initialContent, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(mdHighlight),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          // same reason as the rich-text editor: macOS substitution must not
          // rewrite markdown source as it's typed
          EditorView.contentAttributes.of({
            autocorrect: "off",
            autocapitalize: "off",
            spellcheck: "false",
          }),
          // pasted images become files on disk plus a markdown link
          EditorView.domEventHandlers({
            paste(event, view) {
              const file = imageFromClipboard(event.clipboardData);
              if (!file) return false;
              event.preventDefault();
              savePastedImage(file).then((saved) => {
                if (!saved) return;
                const { from, to } = view.state.selection.main;
                view.dispatch({
                  changes: { from, to, insert: saved.markdown },
                  selection: { anchor: from + saved.markdown.length },
                });
                view.focus();
              });
              return true;
            },
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="source-root" style={{ height: "100%" }} />;
}
