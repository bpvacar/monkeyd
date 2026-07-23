# MonkeyD — User Guide

*The .md editor. (Monkey D. — you get it.)*

MonkeyD is a native macOS markdown editor and viewer built with Tauri 2. It opens any `.md` file, lets you write in rich text or raw markdown, and exports to PDF and HTML. It is extensible with JavaScript plugins and CSS themes.

***

## 1. Getting started

There are four ways to get a document open:

| How                                       | What happens                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| **Double-click any `.md` file** in Finder | MonkeyD is registered as an editor for `.md`, `.markdown`, `.mdown`, `.mkd` |
| **Drag files onto the dock icon**         | Each file opens in its own tab                                              |
| **⌘O** (or File menu → *Open file…*)      | Standard file picker, multiple selection allowed                            |
| **⇧⌘O** (or *Open folder…*)               | Opens a folder as a workspace with a file tree in the sidebar               |

With no document open you'll see the **Start writing** screen with the same three actions: new file, open file, open folder.

***

## 2. The window, top to bottom

```
┌────────────────────────────────────────────────────┐
│ ●●●  [▤] [File]     document.md •     [Aa|</>] [⎙] [⚲] │  ← title bar
├──────────┬─────────────────────────────────────────┤
│ sidebar  │  tab1.md  tab2.md  +                    │  ← tab bar
│ (file    │                                         │
│  tree)   │            your document                │  ← editor
│          │                                         │
├──────────┴─────────────────────────────────────────┤
│ 1,234 words                    Rich text            │  ← status bar
└────────────────────────────────────────────────────┘
```

* **▤** toggles the sidebar (⌘)

* **File menu** — new, open, save, export

* **document title** — shows a blue `•` when there are unsaved changes

* **Aa / `</>`** — switches between rich editing and markdown source (⌘E)

* **⎙** — export the current tab as PDF (⌘P)

* **⚲** — opens the *Plugins & appearance* panel (themes, plugins, plugin commands)

* **Status bar** — live word count and current mode

### The sidebar (workspace)

Open a folder (⇧⌘O) and the sidebar shows its file tree: markdown files and subfolders. Click a file to open it in a tab. The header has two small buttons: **New file in folder** (creates `Untitled.md`-style files directly in the workspace) and **Refresh**.

### Tabs

Every document is a tab. **⌘N** makes a new untitled tab, **⌘W** closes the active one, **+** in the tab bar creates one too. Each tab remembers its own editing mode.

***

## 3. Editing: two modes, one document

MonkeyD's core idea is that you can flip between two views of the same document at any time with **⌘E**:

### Rich text mode (`Aa`)

A live WYSIWYG editor (Typora-style). Type markdown syntax and it renders in place: `# ` becomes a heading as you type, `**bold**` turns bold, `- ` starts a list. There's a slash menu — type `/` on an empty line for blocks (headings, lists, quotes, code blocks, tables, images), and a floating toolbar appears when you select text.

### Source mode (`</>`)

Raw markdown with syntax highlighting, in a monospaced editor (CodeMirror). Best for precise control, front-matter, or when you want to see exactly what's in the file.

Both modes support the same markdown dialect:

* **GitHub-flavored markdown** — tables, task lists (`- [ ]`), strikethrough, autolinks

* **Fenced code blocks** with syntax highlighting (any language highlight.js knows)

* **Math** — inline `$e^{i\pi}+1=0$` and block `$$…$$` via KaTeX

* Images, blockquotes, horizontal rules, footnote-style links

***

## 4. Saving

* **⌘S** saves. Untitled tabs prompt for a location the first time.

* **Autosave**: once a document has a file path, changes are automatically written ~1.2 seconds after you stop typing. The `•` next to the title tells you when something isn't on disk yet.

Files are plain UTF-8 markdown — nothing proprietary is ever added to them.

***

## 5. Export

### PDF (⌘P)

File menu → *Export as PDF…* (or the ⎙ button). The document is rendered through the full pipeline (GFM + KaTeX math + highlighted code) and handed to the **macOS print dialog** — choose **Save as PDF** from the PDF dropdown in the bottom-left corner. You get page size, margins, and orientation control for free.

### HTML

File menu → *Export as HTML…* produces a single self-contained `.html` file with clean typographic styling — good for sharing or publishing.

Plugins can hook into export (see §7) — e.g. to stamp a footer or rewrite links before rendering.

***

## 6. Appearance & themes

Open the **⚲ Plugins & appearance** panel:

* **Theme**: *Match system*, *Light*, or *Dark*.

* **Custom themes**: CSS files you drop into the themes folder appear here by filename. Selecting one layers it over the base theme; *None* returns to stock.

* **Editor width**: how wide the writing column can grow — *Narrow* (~55 characters/line), *Standard* (~65, the classic typographic comfort zone), *Wide* (~85, the default), or *Full width* (fills the window). Applies to both editing modes; themes can override it via the `--col-prose` / `--col-src` CSS variables.

### Writing a custom theme

A theme is a plain `.css` file in:

```
~/Library/Application Support/com.benjaminvaca.monkeyd/themes/
```

You restyle the app by overriding its design tokens. The full set:

```css
:root,
[data-theme="light"] {
  --chrome:  #f2f3f3;   /* window chrome background */
  --chrome-2:#e9eaeb;   /* hover surfaces */
  --chrome-3:#dfe1e2;   /* pressed surfaces */
  --page:    #ffffff;   /* the writing surface */
  --ink:     #1c1f22;   /* main text */
  --ink-muted: #71767b; /* secondary text */
  --ink-faint: #a4a8ac; /* faint text/icons */
  --line:    #e2e3e4;   /* borders */
  --accent:  #1273b8;   /* links, interactive */
  --pencil:  #a9d9e8;   /* selection */
  --pencil-soft: #ddf0f7;
  --danger:  #c04a3a;
  --font-prose: "Literata Variable", Georgia, serif; /* rich text */
  --font-mono: "JetBrains Mono Variable", Menlo, monospace;
}
/* target [data-theme="dark"] separately for dark mode */
```

A ready-made example, `sepia.css`, ships in the project's `examples/themes/` folder (a copy is already installed).

***

## 7. Plugins

Plugins are local JavaScript files that run inside the app at launch.

### Installing

Drop into the plugins folder (⚲ panel → *Open plugins folder*, or):

```
~/Library/Application Support/com.benjaminvaca.monkeyd/plugins/
```

Two accepted shapes:

1. **A single `.js` file** — `my-plugin.js`; the filename becomes the plugin name.
2. **A folder** containing `index.js` and optionally a `plugin.json` manifest:

```json
{ "name": "My Plugin", "version": "1.0.0", "description": "What it does" }
```

Then **relaunch the app**. Plugins load at startup; each can be toggled on/off in the ⚲ panel (a relaunch applies the change). A plugin that throws on load shows its error in the panel instead of breaking the app.

### The API

Each plugin's code runs with a global object named `mdeditor` (the API keeps the app's original internal name so plugins stay compatible):

```js
mdeditor.version                     // "0.1.0"

// Add an entry under "Plugin commands" in the ⚲ panel
mdeditor.registerCommand("my-id", {
  title: "Do the thing",
  run() { /* ... */ },
});

// Events
mdeditor.onFileOpen(({ path, content }) => { ... });
mdeditor.onSave(({ path, content }) => { ... });

// Rewrite markdown before PDF/HTML export (chainable across plugins)
mdeditor.transformMarkdownForExport((md) => md + "\n\n---\n*footer*");

// Inject CSS for the lifetime of the session
mdeditor.addThemeCSS("h1 { letter-spacing: -0.02em; }");

// Document access
mdeditor.getActiveDocument();        // { path, content } or null
mdeditor.setActiveDocument(content); // replace active tab's markdown
mdeditor.renderMarkdown(md);         // markdown → HTML string (same pipeline as export)

// UI
mdeditor.toast("Hello from a plugin");
```

### Example: reading time

Already installed as `reading-time.js` — adds a *Show reading time* command that toasts the word count and estimated minutes, and stamps exports with a footer. Its source doubles as a template: see `examples/plugins/reading-time.js` in the project.

***

## 8. Keyboard shortcuts

| Shortcut | Action                    |
| -------- | ------------------------- |
| ⌘N       | New tab                   |
| ⌘O       | Open file(s)              |
| ⇧⌘O      | Open folder as workspace  |
| ⌘S       | Save                      |
| ⌘W       | Close tab                 |
| ⌘E       | Toggle rich text ↔ source |
| ⌘P       | Export as PDF             |
| ⌘\\      | Toggle sidebar            |

***

## 9. Where everything lives

| Thing                     | Path                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| The app                   | `/Applications/MonkeyD.app`                                           |
| Plugins                   | `~/Library/Application Support/com.benjaminvaca.monkeyd/plugins/`     |
| Custom themes             | `~/Library/Application Support/com.benjaminvaca.monkeyd/themes/`      |
| Source code               | `~/mdeditor`                                                          |
| Examples (plugin + theme) | `~/mdeditor/examples/`                                                |
| This guide                | `~/mdeditor/docs/MonkeyD-Guide.md`                                    |
| Icon source               | `~/mdeditor/app-icon.svg` (regenerate: `npx tauri icon app-icon.svg`) |

### Rebuilding from source

```bash
cd ~/mdeditor
npm install            # once
npm run tauri dev      # development window with hot reload
npm run tauri build    # produces MonkeyD.app + .dmg under src-tauri/target/release/bundle/
```

Tech stack: Tauri 2 (Rust) · React + TypeScript + Vite · Milkdown Crepe (rich text) · CodeMirror 6 (source) · marked + KaTeX + highlight.js (export pipeline).

***

## 10. Troubleshooting

* **A plugin change isn't taking effect** → plugins load only at launch; quit and reopen the app.

* **PDF export opens a print dialog instead of saving directly** → that's by design; use the *PDF ▾ → Save as PDF* dropdown in the dialog.

* **A file type won't open from Finder** → only `md/markdown/mdown/mkd` are associated; anything else can still be opened via ⌘O (`.txt` included).

* **A plugin shows "Failed to load"** → the error text appears on its card in the ⚲ panel; fix the script and relaunch.

