import { convertFileSrc } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { writeBinaryFile } from "./backend";

/** `20260731143022` — the timestamp shape Obsidian uses for pasted images. */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

/** POSIX relative path from a directory to a file, e.g. `../assets/x.png`. */
function relativePath(fromDir: string, toPath: string): string {
  const from = fromDir.split("/").filter(Boolean);
  const to = toPath.split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const up = from.slice(i).map(() => "..");
  return [...up, ...to.slice(i)].join("/");
}

/** Collapses `.` and `..` segments; convertFileSrc won't do it for us. */
function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return `/${out.join("/")}`;
}

/**
 * Maps a link as written in the document to a URL the webview can load.
 * The stored markdown keeps its portable relative path — only what the DOM
 * renders is rewritten, so files on disk stay clean for Obsidian and git.
 */
export function resolveImageSrc(url: string): string {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url; // http:, data:, asset:…
  const tab = useStore.getState().activeTab();
  if (!tab?.path) return url;
  let decoded = url;
  try {
    decoded = decodeURI(url);
  } catch {
    /* malformed escapes: use as-is */
  }
  const abs = decoded.startsWith("/")
    ? decoded
    : `${dirOf(tab.path)}/${decoded}`;
  return convertFileSrc(normalize(abs));
}

/** image/jpeg → jpg, image/svg+xml → svg */
function extensionFor(mime: string): string {
  const sub = (mime.split("/")[1] || "png").split("+")[0].toLowerCase();
  return sub === "jpeg" ? "jpg" : sub;
}

/** Returns the first image in a clipboard payload, or null if there is none. */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export interface SavedAttachment {
  /** Markdown to insert, e.g. `![](../assets/Pasted%20image%20...png)` */
  markdown: string;
  /** Document-relative path, URL-encoded — what goes in the link/`src`. */
  src: string;
  absPath: string;
}

/**
 * Writes a pasted image into the configured attachment folder and returns the
 * markdown link for it. The folder is resolved against the open workspace when
 * there is one, otherwise against the document's own directory.
 *
 * Returns null (with a toast) when it can't proceed — the caller should leave
 * the editor untouched in that case.
 */
export async function savePastedImage(
  file: File
): Promise<SavedAttachment | null> {
  const s = useStore.getState();
  const tab = s.activeTab();

  // Anchor to the workspace root, but only for documents actually inside it —
  // a file opened from elsewhere keeps its attachments next to itself rather
  // than reaching back into an unrelated folder.
  const docDir = tab?.path ? dirOf(tab.path) : null;
  const inWorkspace =
    s.workspace != null &&
    tab?.path != null &&
    tab.path.startsWith(`${s.workspace}/`);
  const base = inWorkspace ? s.workspace : docDir;
  if (!base) {
    s.showToast("Save this document first — images need a folder to live in");
    return null;
  }

  const folder = s.attachmentFolder.replace(/^\/+|\/+$/g, "");
  const name = `Pasted image ${stamp()}.${extensionFor(file.type)}`;
  const absPath = folder ? `${base}/${folder}/${name}` : `${base}/${name}`;

  try {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    await writeBinaryFile(absPath, bytes);
  } catch (e) {
    s.showToast(`Couldn't save image: ${e}`);
    return null;
  }

  // links resolve from the document, which is where a renderer reads them
  const src = encodeURI(relativePath(docDir ?? base, absPath));
  s.showToast(`Saved ${name}`);
  return { markdown: `![](${src})`, src, absPath };
}
