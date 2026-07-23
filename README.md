# MonkeyD

*The `.md` editor.* A native macOS markdown editor and viewer. Tauri 2 (Rust) + React + TypeScript.

## Features

- **Two editing modes, toggleable** (`⌘E`): rich WYSIWYG (Milkdown Crepe — type markdown, see it rendered in place) and raw source (CodeMirror 6 with markdown highlighting).
- **Workspace**: open a folder (`⇧⌘O`) for a sidebar file tree; multi-tab editing; autosave.
- **Opens `.md` files from Finder** — the app registers as an editor for `.md`, `.markdown`, `.mdown`, `.mkd`.
- **PDF export** (`⌘P`): renders the compiled document (GFM tables, task lists, syntax-highlighted code, KaTeX math) through the system print dialog — choose "Save as PDF". HTML export too.
- **Adjustable writing width**: Narrow / Standard / Wide / Full, in the Plugins & appearance panel.
- **Themes**: light / dark / match system, plus custom CSS themes dropped into `<app data>/themes/*.css`.
- **Plugins**: JavaScript files in `<app data>/plugins/` (a `name.js` file, or a folder with `index.js` + optional `plugin.json`). See `examples/plugins/reading-time.js`.

`<app data>` is `~/Library/Application Support/com.benjaminvaca.monkeyd/`.

See [`docs/MonkeyD-Guide.md`](docs/MonkeyD-Guide.md) for the full user guide.

## Install

Download the latest `.dmg` from [Releases](../../releases), open it, and drag **MonkeyD** to Applications.

> The app is not yet notarized by Apple, so on first launch macOS Gatekeeper may block it.
> Right-click the app → **Open** → **Open**, or run `xattr -dr com.apple.quarantine /Applications/MonkeyD.app`.
> Builds are currently Apple Silicon (`aarch64`) only.

## Plugin API

Each plugin runs at startup with an `mdeditor` global:

| Method | Purpose |
| --- | --- |
| `registerCommand(id, {title, run})` | Add a command to the Plugins panel |
| `onFileOpen(cb)` / `onSave(cb)` | React to document lifecycle |
| `getActiveDocument()` / `setActiveDocument(md)` | Read/replace the open document |
| `transformMarkdownForExport(fn)` | Rewrite markdown before PDF/HTML export |
| `addThemeCSS(css)` | Inject styles |
| `renderMarkdown(md)` | Markdown → HTML helper |
| `toast(msg)` | Show a notification |

## Keyboard shortcuts

`⌘N` new · `⌘O` open file · `⇧⌘O` open folder · `⌘S` save · `⌘W` close tab · `⌘E` toggle WYSIWYG/source · `⌘P` export PDF · `⌘\` toggle sidebar

## Development

Requires [Rust](https://rustup.rs) and Node.js.

```bash
npm install
npm run tauri dev     # run the app with hot reload
npm run tauri build   # produce .app + .dmg in src-tauri/target/release/bundle/
```

## Tech

Tauri 2 · React + TypeScript + Vite · Milkdown Crepe (WYSIWYG) · CodeMirror 6 (source) · marked + KaTeX + highlight.js (export pipeline).

## License

[MIT](LICENSE) © Benjamín Vaca
