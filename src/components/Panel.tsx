import { useEffect, useRef } from "react";

/** Right-hand sheet: takes focus on open, Esc or the scrim closes it, focus goes back after. */
export default function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, []);

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <div className="panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="tool-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </>
  );
}
