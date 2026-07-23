import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

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
    const crepe = new Crepe({ root, defaultValue: initialContent });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prev) => {
        if (markdown !== prev) onChangeRef.current(markdown);
      });
    });
    let destroyed = false;
    crepe.create().catch((e) => console.error("crepe mount failed", e));
    return () => {
      if (!destroyed) {
        destroyed = true;
        crepe.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="wysiwyg-root" />;
}
