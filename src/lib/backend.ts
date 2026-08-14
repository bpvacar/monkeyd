import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface PluginSource {
  id: string;
  name: string;
  version: string;
  description: string;
  code: string;
}

export interface UserTheme {
  name: string;
  css: string;
}

export const readTextFile = (path: string) =>
  invoke<string>("read_text_file", { path });

export const writeTextFile = (path: string, contents: string) =>
  invoke<void>("write_text_file", { path, contents });

export const writeBinaryFile = (path: string, bytes: number[]) =>
  invoke<void>("write_binary_file", { path, bytes });

export interface OrphanFile {
  path: string;
  name: string;
  size: number;
}

export const findOrphanAttachments = (root: string, folder: string) =>
  invoke<OrphanFile[]>("find_orphan_attachments", { root, folder });

export const trashFiles = (paths: string[]) =>
  invoke<void>("trash_files", { paths });

export const createFile = (path: string) => invoke<void>("create_file", { path });

export const renamePath = (from: string, to: string) =>
  invoke<void>("rename_path", { from, to });

export const createFolder = (path: string) =>
  invoke<void>("create_folder", { path });

export const copyFile = (from: string, to: string) =>
  invoke<void>("copy_file", { from, to });

export const listDir = (path: string) => invoke<DirEntry[]>("list_dir", { path });

export const getPendingFiles = () => invoke<string[]>("get_pending_files");

export const pluginsDir = () => invoke<string>("plugins_dir");

export const loadPlugins = () => invoke<PluginSource[]>("load_plugins");

export const loadUserThemes = () => invoke<UserTheme[]>("load_user_themes");
