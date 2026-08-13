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

/// Writes raw bytes (pasted images and other attachments), creating the
/// containing folder if it doesn't exist yet.
#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &bytes).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct OrphanFile {
    path: String,
    name: String,
    size: u64,
}

const IMAGE_EXTS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic"];

fn collect_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.filter_map(|e| e.ok()) {
        let p = entry.path();
        let hidden = p
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false);
        if hidden {
            continue;
        }
        if p.is_dir() {
            collect_files(&p, out);
        } else {
            out.push(p);
        }
    }
}

/// Resolves `..`/`.` without touching the filesystem.
fn normalize(path: &Path) -> String {
    let mut parts: Vec<String> = Vec::new();
    for comp in path.to_string_lossy().split('/') {
        match comp {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other.to_string()),
        }
    }
    format!("/{}", parts.join("/"))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Images in the attachment folder that no markdown file in the workspace
/// links to. Deliberately conservative: anything referenced by full path *or*
/// by bare filename (Obsidian `![[wikilinks]]`) counts as used.
#[tauri::command]
fn find_orphan_attachments(root: String, folder: String) -> Result<Vec<OrphanFile>, String> {
    let root_path = Path::new(&root);
    let attach_dir = if folder.trim_matches('/').is_empty() {
        root_path.to_path_buf()
    } else {
        root_path.join(folder.trim_matches('/'))
    };
    if !attach_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut all: Vec<std::path::PathBuf> = Vec::new();
    collect_files(root_path, &mut all);

    // ](target) · ](<target with spaces>) · [[target]] · src="target"
    let link_re =
        regex::Regex::new(r#"\]\(\s*(?:<([^>]+)>|([^)\s]+))"#).map_err(|e| e.to_string())?;
    let wiki_re = regex::Regex::new(r"\[\[([^\]|#]+)").map_err(|e| e.to_string())?;
    let html_re = regex::Regex::new(r#"src\s*=\s*["']([^"']+)"#).map_err(|e| e.to_string())?;

    let mut used_paths: std::collections::HashSet<String> = Default::default();
    let mut used_names: std::collections::HashSet<String> = Default::default();

    for md in all.iter().filter(|p| {
        p.extension()
            .map(|e| {
                let e = e.to_string_lossy().to_lowercase();
                e == "md" || e == "markdown" || e == "mdown" || e == "mkd"
            })
            .unwrap_or(false)
    }) {
        let Ok(text) = fs::read_to_string(md) else { continue };
        let base = md.parent().unwrap_or(root_path);
        let mut targets: Vec<String> = Vec::new();
        for c in link_re.captures_iter(&text) {
            // group 1 is the <angle-bracketed> form, group 2 the plain one
            if let Some(m) = c.get(1).or_else(|| c.get(2)) {
                targets.push(m.as_str().to_string());
            }
        }
        for c in html_re.captures_iter(&text) {
            targets.push(c[1].to_string());
        }
        for c in wiki_re.captures_iter(&text) {
            // wikilinks may be a bare name or carry a folder; record both so
            // neither shape looks unreferenced
            let target = percent_decode(c[1].trim());
            if let Some(name) = Path::new(&target).file_name() {
                used_names.insert(name.to_string_lossy().into_owned());
            }
            used_names.insert(target);
        }
        for t in targets {
            let decoded = percent_decode(t.trim());
            if decoded.contains("://") || decoded.starts_with("data:") {
                continue;
            }
            if let Some(name) = Path::new(&decoded).file_name() {
                used_names.insert(name.to_string_lossy().into_owned());
            }
            let abs = if decoded.starts_with('/') {
                std::path::PathBuf::from(&decoded)
            } else {
                base.join(&decoded)
            };
            used_paths.insert(normalize(&abs));
        }
    }

    let mut attachments: Vec<std::path::PathBuf> = Vec::new();
    collect_files(&attach_dir, &mut attachments);

    let mut orphans: Vec<OrphanFile> = attachments
        .into_iter()
        .filter(|p| {
            p.extension()
                .map(|e| IMAGE_EXTS.contains(&e.to_string_lossy().to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .filter(|p| {
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned());
            !used_paths.contains(&normalize(p))
                && !name.map(|n| used_names.contains(&n)).unwrap_or(false)
        })
        .map(|p| OrphanFile {
            size: fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
            name: p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: p.to_string_lossy().into_owned(),
        })
        .collect();
    orphans.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(orphans)
}

/// Moves files to the system Trash, so a mistaken cleanup stays recoverable.
#[tauri::command]
fn trash_files(paths: Vec<String>) -> Result<(), String> {
    trash::delete_all(&paths).map_err(|e| e.to_string())
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
            write_binary_file,
            find_orphan_attachments,
            trash_files,
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Removes the temp vault even if an assertion fails.
    struct TempVault(std::path::PathBuf);
    impl Drop for TempVault {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn put(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    fn orphan_names(root: &Path) -> Vec<String> {
        let mut names =
            find_orphan_attachments(root.to_string_lossy().into(), "assets".into())
                .unwrap()
                .into_iter()
                .map(|o| o.name)
                .collect::<Vec<_>>();
        names.sort();
        names
    }

    #[test]
    fn reports_only_images_no_note_links_to() {
        let root = std::env::temp_dir().join(format!("monkeyd-orphans-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let _guard = TempVault(root.clone());

        for name in [
            "rel.png",
            "wiki.png",
            "wiki-in-folder.png",
            "html.png",
            "updir.png",
            "angle brackets.png",
            "Pasted image 20260101010101.png",
            "unused.png",
        ] {
            put(&root.join("assets").join(name), "x");
        }

        // every shape a link can take in the wild
        put(
            &root.join("notas/a.md"),
            "![](../assets/rel.png)\n\
             ![](../assets/Pasted%20image%2020260101010101.png)\n\
             ![](<../assets/angle brackets.png>)\n\
             <img src=\"../assets/html.png\">\n",
        );
        put(&root.join("notas/b.md"), "![[wiki.png]]\n![[assets/wiki-in-folder.png|300]]\n");
        put(&root.join("notas/sub/c.md"), "![](../../assets/updir.png)\n");

        assert_eq!(
            orphan_names(&root),
            vec!["unused.png"],
            "only the genuinely unreferenced image should be reported"
        );
    }

    #[test]
    fn trashes_files_without_destroying_them() {
        let f = std::env::temp_dir()
            .join(format!("monkeyd-trash-probe-{}.png", std::process::id()));
        fs::write(&f, "x").unwrap();
        assert!(f.exists());
        trash_files(vec![f.to_string_lossy().into()]).unwrap();
        assert!(!f.exists(), "file should be gone from its original path");
    }

    #[test]
    fn reports_nothing_when_the_folder_is_missing() {
        let root = std::env::temp_dir().join(format!("monkeyd-noattach-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let _guard = TempVault(root.clone());
        put(&root.join("notas/a.md"), "# no images here\n");
        assert!(orphan_names(&root).is_empty());
    }
}
