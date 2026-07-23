import { useStore } from "../store";
import * as backend from "../lib/backend";
import { exportTransforms, renderMarkdown } from "../lib/exporter";
import type { PluginSource } from "../lib/backend";

export interface PluginCommand {
  id: string;
  title: string;
  run: () => void;
}

export interface LoadedPlugin extends PluginSource {
  enabled: boolean;
  error: string | null;
}

type Listener = (payload: { path: string | null; content: string }) => void;

const commands: PluginCommand[] = [];
const fileOpenListeners: Listener[] = [];
const saveListeners: Listener[] = [];

export const pluginState: { plugins: LoadedPlugin[] } = { plugins: [] };

const disabledKey = "disabledPlugins";
const getDisabled = (): string[] =>
  JSON.parse(localStorage.getItem(disabledKey) ?? "[]");

export function setPluginEnabled(id: string, enabled: boolean) {
  const disabled = new Set(getDisabled());
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  localStorage.setItem(disabledKey, JSON.stringify([...disabled]));
}

export const getCommands = () => commands;

export function notifyFileOpen(path: string | null, content: string) {
  for (const fn of fileOpenListeners) {
    try {
      fn({ path, content });
    } catch { /* plugin errors must not break the app */ }
  }
}

export function notifySave(path: string | null, content: string) {
  for (const fn of saveListeners) {
    try {
      fn({ path, content });
    } catch { /* plugin errors must not break the app */ }
  }
}

/** The API surface handed to each plugin as the `mdeditor` global. */
function makeApi(pluginName: string) {
  return {
    version: "0.1.0",
    registerCommand(id: string, opts: { title: string; run: () => void }) {
      commands.push({ id: `${pluginName}.${id}`, title: opts.title, run: opts.run });
    },
    onFileOpen(cb: Listener) {
      fileOpenListeners.push(cb);
    },
    onSave(cb: Listener) {
      saveListeners.push(cb);
    },
    transformMarkdownForExport(fn: (md: string) => string) {
      exportTransforms.push(fn);
    },
    addThemeCSS(css: string) {
      const el = document.createElement("style");
      el.dataset.plugin = pluginName;
      el.textContent = css;
      document.head.appendChild(el);
    },
    renderMarkdown,
    getActiveDocument() {
      const tab = useStore.getState().activeTab();
      return tab ? { path: tab.path, content: tab.content } : null;
    },
    setActiveDocument(content: string) {
      const s = useStore.getState();
      const tab = s.activeTab();
      if (tab) s.setContent(tab.id, content);
    },
    toast(msg: string) {
      useStore.getState().showToast(String(msg));
    },
  };
}

export type PluginApi = ReturnType<typeof makeApi>;

export async function initPlugins(): Promise<LoadedPlugin[]> {
  let sources: PluginSource[] = [];
  try {
    sources = await backend.loadPlugins();
  } catch {
    return [];
  }
  const disabled = new Set(getDisabled());
  const loaded: LoadedPlugin[] = sources.map((src) => {
    const enabled = !disabled.has(src.id);
    let error: string | null = null;
    if (enabled) {
      try {
        // Plugins are local files the user placed in their plugins folder,
        // executed with an explicit API object.
        const fn = new Function("mdeditor", src.code);
        fn(makeApi(src.name));
      } catch (e) {
        error = String(e);
      }
    }
    return { ...src, enabled, error };
  });
  pluginState.plugins = loaded;
  return loaded;
}
