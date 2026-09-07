import { useStore } from "../store";
import { reloadFromDisk, overwriteOnDisk } from "../lib/sync";

/**
 * Shown when a file changed outside the app while this tab had unsaved edits.
 * Autosave is blocked for that tab until one side is chosen, so neither
 * version can be lost by simply continuing to type.
 */
export default function ConflictBar() {
  const tab = useStore((s) => s.activeTab());
  if (!tab?.conflict) return null;

  return (
    <div className="conflict-bar" role="alert">
      <span className="conflict-text">
        <strong>{tab.title}</strong> changed on disk while you were editing.
        Saving is paused.
      </span>
      <span className="conflict-actions">
        <button className="btn" onClick={() => reloadFromDisk(tab.id)}>
          Use the file
        </button>
        <button className="btn primary" onClick={() => overwriteOnDisk(tab.id)}>
          Keep mine
        </button>
      </span>
    </div>
  );
}
