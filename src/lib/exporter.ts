import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);
marked.use(markedKatex({ throwOnError: false }));
marked.use({ gfm: true });

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Hooks registered by plugins to transform markdown before export. */
export const exportTransforms: Array<(md: string) => string> = [];

function applyTransforms(md: string): string {
  return exportTransforms.reduce((acc, fn) => {
    try {
      return fn(acc);
    } catch {
      return acc;
    }
  }, md);
}

/**
 * Renders the document into the print mount and opens the system print
 * dialog, where "Save as PDF" produces the export.
 */
export function exportToPdf(markdown: string) {
  const mount = document.getElementById("print-mount");
  if (!mount) return;
  mount.innerHTML = renderMarkdown(applyTransforms(markdown));
  // let the DOM/styles settle before invoking print
  requestAnimationFrame(async () => {
    try {
      // native print (reliable in WKWebView)
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("print_window");
    } catch {
      window.print();
    }
  });
}

export function exportToHtml(markdown: string, title: string): string {
  const body = renderMarkdown(applyTransforms(markdown));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  body { font-family: Georgia, serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #1c1f22; }
  pre { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: .85em; }
  code { font-family: ui-monospace, Menlo, monospace; }
  blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid #a9d9e8; color: #444; }
  table { border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 4px 10px; } th { background: #f0f0f0; }
  img { max-width: 100%; }
  a { color: #1273b8; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
