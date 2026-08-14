import { useRef, useState } from "react";
import { useStore, type PromptRequest } from "../store";

function PromptForm({
  prompt,
  resolve,
}: {
  prompt: PromptRequest;
  resolve: (v: string | null) => void;
}) {
  // seeded from the request, so the field holds its text on the very first
  // render — the selection below would otherwise land on an empty input
  const [value, setValue] = useState(prompt.initial);
  const selected = useRef(false);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) resolve(trimmed);
  };

  return (
    <>
      <div className="panel-scrim" onClick={() => resolve(null)} />
      <div className="prompt" role="dialog" aria-label={prompt.title}>
        <h2>{prompt.title}</h2>
        <label>
          <span>{prompt.label}</span>
          <input
            autoFocus
            value={value}
            spellCheck={false}
            onFocus={(e) => {
              // select once, when focus actually arrives; doing this earlier
              // gets clobbered as the browser places the caret
              if (selected.current) return;
              selected.current = true;
              const dot = prompt.initial.lastIndexOf(".");
              if (prompt.selectBasename && dot > 0) {
                e.currentTarget.setSelectionRange(0, dot);
              } else {
                e.currentTarget.select();
              }
            }}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                resolve(null);
              }
            }}
          />
        </label>
        <div className="prompt-actions">
          <button className="btn" onClick={() => resolve(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!value.trim()}>
            {prompt.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Modal name prompt, driven by `store.askName()`. Used for rename and for
 * naming new files/folders — WKWebView's native prompt() isn't dependable,
 * and this keeps the interaction styled like the rest of the app.
 */
export default function PromptDialog() {
  const prompt = useStore((s) => s.prompt);
  const resolvePrompt = useStore((s) => s.resolvePrompt);
  if (!prompt) return null;
  // remount per request so the field always starts from that request's name
  return (
    <PromptForm
      key={`${prompt.title}:${prompt.initial}`}
      prompt={prompt}
      resolve={resolvePrompt}
    />
  );
}
