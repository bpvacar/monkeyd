import { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { findOrphanAttachments, trashFiles, type OrphanFile } from "../lib/backend";
import Panel from "./Panel";

const formatSize = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** File ▸ Clean Up Unused Images…: lists attachments no note links to, and trashes the chosen ones. */
export default function UnusedImagesPanel() {
  const open = useStore((s) => s.unusedImagesOpen);
  const setOpen = useStore((s) => s.setUnusedImagesOpen);
  const workspace = useStore((s) => s.workspace);
  const attachmentFolder = useStore((s) => s.attachmentFolder);
  const showToast = useStore((s) => s.showToast);
  const [orphans, setOrphans] = useState<OrphanFile[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !workspace) return;
    setOrphans(null);
    findOrphanAttachments(workspace, attachmentFolder)
      .then((found) => {
        setOrphans(found);
        setChosen(new Set(found.map((f) => f.path)));
      })
      .catch((e) => {
        setOpen(false);
        showToast(`Couldn't look through “${attachmentFolder}”: ${e}`, "error");
      });
  }, [open, workspace, attachmentFolder, setOpen, showToast]);

  if (!open) return null;

  const trashChosen = async () => {
    const paths = [...chosen];
    if (paths.length === 0) return;
    const total = (orphans ?? [])
      .filter((o) => chosen.has(o.path))
      .reduce((n, o) => n + o.size, 0);
    const ok = await ask(
      `Move ${paths.length} unused image${paths.length === 1 ? "" : "s"} ` +
        `(${formatSize(total)}) to the Trash?\n\n` +
        `They can be restored from the Trash if this was a mistake.`,
      { kind: "warning", okLabel: "Move to Trash", cancelLabel: "Cancel" }
    );
    if (!ok) return;
    try {
      await trashFiles(paths);
      setOrphans((prev) => (prev ?? []).filter((o) => !chosen.has(o.path)));
      setChosen(new Set());
      showToast(`Moved ${paths.length} to Trash`);
    } catch (e) {
      showToast(`Couldn't move the images to the Trash: ${e}`, "error");
    }
  };

  return (
    <Panel title="Unused images" onClose={() => setOpen(false)}>
      <p className="setting-hint" style={{ padding: "4px 10px 8px" }}>
        {workspace
          ? `Images in “${attachmentFolder}” that no note in the open folder links to.`
          : "Open a folder first (⇧⌘O) so there's a vault to look through."}
      </p>
      {workspace && orphans === null && <p className="setting-hint" style={{ padding: "0 10px" }}>Looking…</p>}
      {orphans?.length === 0 && (
        <p className="setting-hint" style={{ padding: "0 10px" }}>
          Every image in the attachment folder is used by a note.
        </p>
      )}
      {orphans && orphans.length > 0 && (
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
            <button className="link-btn" onClick={trashChosen} disabled={chosen.size === 0}>
              Move {chosen.size} to Trash
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
