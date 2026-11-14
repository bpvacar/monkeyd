import { useEffect, useState } from "react";
import { explain, useStore, type ThemePref, type EditorWidth } from "../store";
import {
  pluginState,
  setPluginEnabled,
  getCommands,
  type LoadedPlugin,
} from "../plugins/runtime";
import { pluginsDir, loadUserThemes, type UserTheme } from "../lib/backend";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import Panel from "./Panel";

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
      showToast(`Couldn't open the plugins folder. ${explain(e)}`, "error");
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

  const commands = getCommands();

  return (
    <Panel title="Settings" onClose={() => setOpen(false)}>
          <div className="panel-section-label">Theme</div>
          {themeChoices.map((t) => (
            <button
              key={t.id}
              className="theme-row"
              aria-pressed={theme === t.id}
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
              <button className="theme-row" aria-pressed={!userTheme} onClick={() => setUserTheme(null)}>
                <span>None</span>
                {!userTheme && <span className="check">✓</span>}
              </button>
              {themes.map((t) => (
                <button
                  key={t.name}
                  className="theme-row"
                  aria-pressed={userTheme === t.name}
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
              aria-pressed={editorWidth === w.id}
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
              aria-pressed={imageMaxEdge === c.px}
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
    </Panel>
  );
}
