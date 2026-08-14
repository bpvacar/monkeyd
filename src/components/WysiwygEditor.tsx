import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import {
  imageFromClipboard,
  resolveImageSrc,
  savePastedImage,
} from "../lib/attachments";
import { frontmatter } from "../plugins/frontmatter";

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
    // YAML front matter must round-trip untouched — see plugins/frontmatter.ts
    crepe.editor.use(frontmatter);

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
    crepe
      .create()
      // focus on mount so typing (and ⌘V) land in the document straight away,
      // matching the source editor's behaviour
      .then(() => {
        if (destroyed) return;
        crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
      })
      .catch((e) => console.error("crepe mount failed", e));
    return () => {
      root.removeEventListener("paste", onPaste, true);
      if (!destroyed) {
        destroyed = true;
        crepe.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="wysiwyg-root" />;
}
