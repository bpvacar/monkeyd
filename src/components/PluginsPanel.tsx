import { useEffect, useState } from "react";
import { useStore, type ThemePref, type EditorWidth } from "../store";
import {
  pluginState,
  setPluginEnabled,
  getCommands,
  type LoadedPlugin,
} from "../plugins/runtime";
import { pluginsDir, loadUserThemes, type UserTheme } from "../lib/backend";
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
