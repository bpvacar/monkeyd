use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

/// Files the OS asked us to open before the frontend was ready.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
struct PluginSource {
    id: String,
    name: String,
    version: String,
    description: String,
    code: String,
}

#[derive(Serialize)]
struct UserTheme {
    name: String,
    css: String,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file with that name already exists".into());
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                return None;
            }
            let is_dir = p.is_dir();
            let is_md = p
                .extension()
                .map(|x| matches!(x.to_string_lossy().to_lowercase().as_str(), "md" | "markdown" | "txt"))
                .unwrap_or(false);
            if !is_dir && !is_md {
                return None;
            }
            Some(DirEntry {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_pending_files(state: State<PendingFiles>) -> Vec<String> {
    state.0.lock().unwrap().drain(..).collect()
}

fn app_subdir(app: &tauri::AppHandle, sub: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(sub);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn plugins_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app_subdir(&app, "plugins")?.to_string_lossy().to_string())
}

/// Plugins live in <app-data>/plugins. Each plugin is either a bare `<name>.js`
/// file or a `<name>/` folder containing `index.js` and optional `plugin.json`
/// with { name, version, description }.
#[tauri::command]
fn load_plugins(app: tauri::AppHandle) -> Result<Vec<PluginSource>, String> {
    let dir = app_subdir(&app, "plugins")?;
    let mut plugins = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let p = entry.path();
        let id = entry.file_name().to_string_lossy().to_string();
        if id.starts_with('.') {
            continue;
        }
        let (code, manifest_path) = if p.is_dir() {
            (fs::read_to_string(p.join("index.js")), Some(p.join("plugin.json")))
        } else if p.extension().map(|x| x == "js").unwrap_or(false) {
            (fs::read_to_string(&p), None)
        } else {
            continue;
        };
        let Ok(code) = code else { continue };
        let mut name = id.trim_end_matches(".js").to_string();
        let mut version = "0.0.0".to_string();
        let mut description = String::new();
        if let Some(mp) = manifest_path {
            if let Ok(raw) = fs::read_to_string(mp) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(s) = v.get("name").and_then(|s| s.as_str()) {
                        name = s.to_string();
                    }
                    if let Some(s) = v.get("version").and_then(|s| s.as_str()) {
                        version = s.to_string();
                    }
                    if let Some(s) = v.get("description").and_then(|s| s.as_str()) {
                        description = s.to_string();
                    }
                }
            }
        }
        plugins.push(PluginSource {
            id,
            name,
            version,
            description,
            code,
        });
    }
    plugins.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(plugins)
}

/// User themes are plain CSS files in <app-data>/themes.
#[tauri::command]
fn load_user_themes(app: tauri::AppHandle) -> Result<Vec<UserTheme>, String> {
    let dir = app_subdir(&app, "themes")?;
    let mut themes = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.extension().map(|x| x == "css").unwrap_or(false) {
            if let Ok(css) = fs::read_to_string(&p) {
                themes.push(UserTheme {
                    name: p
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    css,
                });
            }
        }
    }
    themes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(themes)
}

fn queue_and_notify(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
    // Nudge the frontend to drain the queue; harmless if it isn't mounted yet,
    // because it also drains on mount.
    let _ = app.emit("files-pending", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            create_file,
            list_dir,
            get_pending_files,
            print_window,
            plugins_dir,
            load_plugins,
            load_user_themes
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| !a.starts_with('-') && Path::new(a).exists())
                .collect();
            queue_and_notify(app.handle(), args);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                queue_and_notify(app, paths);
            }
        });
}
