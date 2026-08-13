import { useEffect, useState } from "react";
import { useStore, type ThemePref, type EditorWidth } from "../store";
import {
  pluginState,
  setPluginEnabled,
  getCommands,
  type LoadedPlugin,
} from "../plugins/runtime";
import {
  pluginsDir,
  loadUserThemes,
  findOrphanAttachments,
  trashFiles,
  type UserTheme,
  type OrphanFile,
} from "../lib/backend";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export default function PluginsPanel() {
  const open = useStore((s) => s.pluginsPanelOpen);
  const setOpen = useStore((s) => s.setPluginsPanelOpen);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const userTheme = useStore((s) => s.userTheme);
  const setUserTheme = useStore((s) => s.setUserTheme);
  const editorWidth = useStore((s) => s.editorWidth);
  const setEditorWidth = useStore((s) => s.setEditorWidth);
  const attachmentFolder = useStore((s) => s.attachmentFolder);
  const setAttachmentFolder = useStore((s) => s.setAttachmentFolder);
  const imageMaxEdge = useStore((s) => s.imageMaxEdge);
  const setImageMaxEdge = useStore((s) => s.setImageMaxEdge);
  const workspace = useStore((s) => s.workspace);
  const [orphans, setOrphans] = useState<OrphanFile[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const showToast = useStore((s) => s.showToast);

  const [plugins, setPlugins] = useState<LoadedPlugin[]>([]);
  const [themes, setThemes] = useState<UserTheme[]>([]);

  useEffect(() => {
    if (!open) return;
    setPlugins(pluginState.plugins);
    loadUserThemes().then(setThemes).catch(() => setThemes([]));
  }, [open]);

  if (!open) return null;

  const openPluginsFolder = async () => {
    try {
      const dir = await pluginsDir();
      await revealItemInDir(dir);
    } catch (e) {
      showToast(String(e));
    }
  };

  const themeChoices: Array<{ id: ThemePref; label: string }> = [
    { id: "system", label: "Match system" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  const widthChoices: Array<{ id: EditorWidth; label: string; hint: string }> = [
    { id: "narrow", label: "Narrow", hint: "~55 characters" },
    { id: "standard", label: "Standard", hint: "~65 characters" },
    { id: "wide", label: "Wide", hint: "~85 characters" },
    { id: "full", label: "Full width", hint: "fills the window" },
  ];

  const sizeChoices = [
    { px: 0, label: "Original", hint: "no processing" },
    { px: 2560, label: "Large", hint: "max 2560 px" },
    { px: 1920, label: "Medium", hint: "max 1920 px" },
    { px: 1280, label: "Small", hint: "max 1280 px" },
  ];

  const formatSize = (n: number) =>
    n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

  const scanOrphans = async () => {
    if (!workspace) {
      showToast("Open a folder first (⇧⌘O) so there's a vault to scan");
      return;
    }
    setScanning(true);
    try {
      const found = await findOrphanAttachments(workspace, attachmentFolder);
      setOrphans(found);
      setChosen(new Set(found.map((f) => f.path)));
    } catch (e) {
      showToast(String(e));
    } finally {
      setScanning(false);
    }
  };

  const trashChosen = async () => {
    const paths = [...chosen];
    if (paths.length === 0) return;
    const total = (orphans ?? [])
      .filter((o) => chosen.has(o.path))
      .reduce((n, o) => n + o.size, 0);
    const ok = window.confirm(
      `Move ${paths.length} unused image${paths.length === 1 ? "" : "s"} ` +
        `(${formatSize(total)}) to the Trash?\n\n` +
        `They can be restored from the Trash if this was a mistake.`
    );
    if (!ok) return;
    try {
      await trashFiles(paths);
      setOrphans((prev) => (prev ?? []).filter((o) => !chosen.has(o.path)));
      setChosen(new Set());
      showToast(`Moved ${paths.length} to Trash`);
    } catch (e) {
      showToast(`Couldn't move to Trash: ${e}`);
    }
  };

  const commands = getCommands();

  return (
    <>
      <div className="panel-scrim" onClick={() => setOpen(false)} />
      <div className="panel" role="dialog" aria-label="Plugins and appearance">
        <div className="panel-head">
          <h2>Plugins &amp; appearance</h2>
          <button className="tool-btn" onClick={() => setOpen(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="panel-body">
          <div className="panel-section-label">Theme</div>
          {themeChoices.map((t) => (
            <button
              key={t.id}
              className="theme-row"
              onClick={() => setTheme(t.id)}
            >
              <span>{t.label}</span>
              {theme === t.id && !userTheme && <span className="check">✓</span>}
              {theme === t.id && userTheme && <span className="check">·</span>}
            </button>
          ))}
          {themes.length > 0 && (
            <>
              <div className="panel-section-label">Custom themes</div>
              <button className="theme-row" onClick={() => setUserTheme(null)}>
                <span>None</span>
                {!userTheme && <span className="check">✓</span>}
              </button>
              {themes.map((t) => (
                <button
                  key={t.name}
                  className="theme-row"
                  onClick={() => setUserTheme(t.name)}
                >
                  <span>{t.name}</span>
                  {userTheme === t.name && <span className="check">✓</span>}
                </button>
              ))}
            </>
          )}

          <div className="panel-section-label">Editor width</div>
          {widthChoices.map((w) => (
            <button
              key={w.id}
              className="theme-row"
              onClick={() => setEditorWidth(w.id)}
            >
              <span>
                {w.label}{" "}
                <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>
                  {w.hint}
                </span>
              </span>
              {editorWidth === w.id && <span className="check">✓</span>}
            </button>
          ))}

          <div className="panel-section-label">Attachments</div>
          <label className="setting-field">
            <span>Folder for pasted images</span>
            <input
              type="text"
              value={attachmentFolder}
              placeholder="assets"
              spellCheck={false}
              onChange={(e) => setAttachmentFolder(e.target.value)}
            />
            <span className="setting-hint">
              Relative to the open folder (or to the document, when no folder is
              open). Images are saved as{" "}
              <code>Pasted image YYYYMMDDHHMMSS.png</code>.
            </span>
          </label>

          <div className="panel-section-label">Pasted image size</div>
          {sizeChoices.map((c) => (
            <button
              key={c.px}
              className="theme-row"
              onClick={() => setImageMaxEdge(c.px)}
            >
              <span>
                {c.label}{" "}
                <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>
                  {c.hint}
                </span>
              </span>
              {imageMaxEdge === c.px && <span className="check">✓</span>}
            </button>
          ))}
          <p className="setting-hint" style={{ padding: "2px 10px 8px" }}>
            Larger images are scaled down and saved as JPEG (PNG if they have
            transparency). Images already within the limit are stored untouched.
          </p>

          <div className="panel-section-label">Unused images</div>
          {orphans === null ? (
            <>
              <button className="link-btn" onClick={scanOrphans} disabled={scanning}>
                {scanning ? "Scanning…" : "Find unused images…"}
              </button>
              <p className="setting-hint" style={{ padding: "4px 10px 8px" }}>
                Looks for images in the attachment folder that no note in the
                open folder links to.
              </p>
            </>
          ) : orphans.length === 0 ? (
            <>
              <p className="setting-hint" style={{ padding: "4px 10px 8px" }}>
                Every image in the attachment folder is used by a note.
              </p>
              <button className="link-btn" onClick={() => setOrphans(null)}>
                Done
              </button>
            </>
          ) : (
            <>
              {orphans.map((o) => (
                <label key={o.path} className="orphan-row">
                  <input
                    type="checkbox"
                    checked={chosen.has(o.path)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      e.target.checked ? next.add(o.path) : next.delete(o.path);
                      setChosen(next);
                    }}
                  />
                  <span className="orphan-name" title={o.path}>
                    {o.name}
                  </span>
                  <span className="orphan-size">{formatSize(o.size)}</span>
                </label>
              ))}
              <div className="orphan-actions">
                <button
                  className="link-btn"
                  onClick={trashChosen}
                  disabled={chosen.size === 0}
                >
                  Move {chosen.size} to Trash
                </button>
                <button className="link-btn" onClick={() => setOrphans(null)}>
                  Cancel
                </button>
              </div>
            </>
          )}

          <div className="panel-section-label">Plugins</div>
          {plugins.length === 0 ? (
            <p className="plugin-empty">
              No plugins installed. Drop a <code>.js</code> file (or a folder
              with an <code>index.js</code>) into the plugins folder, then
              relaunch the app.{" "}
              <button className="link-btn" onClick={openPluginsFolder}>
                Open plugins folder
              </button>
            </p>
          ) : (
            <>
              {plugins.map((p) => (
                <div key={p.id} className="plugin-card">
                  <div className="top">
                    <span>
                      <span className="name">{p.name}</span>
                      <span className="ver">v{p.version}</span>
                    </span>
                    <button
                      className={`toggle ${p.enabled ? "on" : ""}`}
                      role="switch"
                      aria-checked={p.enabled}
                      aria-label={`${p.enabled ? "Disable" : "Enable"} ${p.name}`}
                      onClick={() => {
                        setPluginEnabled(p.id, !p.enabled);
                        setPlugins((ps) =>
                          ps.map((x) =>
                            x.id === p.id ? { ...x, enabled: !p.enabled } : x
                          )
                        );
                        showToast("Relaunch the app to apply plugin changes");
                      }}
                    />
                  </div>
                  {p.description && <p className="desc">{p.description}</p>}
                  {p.error && (
                    <p className="desc" style={{ color: "var(--danger)" }}>
                      Failed to load: {p.error}
                    </p>
                  )}
                </div>
              ))}
              <button className="link-btn" onClick={openPluginsFolder}>
                Open plugins folder
              </button>
            </>
          )}

          {commands.length > 0 && (
            <>
              <div className="panel-section-label">Plugin commands</div>
              {commands.map((c) => (
                <button
                  key={c.id}
                  className="theme-row"
                  onClick={() => c.run()}
                >
                  <span>{c.title}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
