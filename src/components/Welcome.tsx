import { useStore } from "../store";
import { openFileDialog, openFolderDialog } from "../lib/fileops";

export default function Welcome() {
  const newTab = useStore((s) => s.newTab);

  return (
    <div className="welcome">
      <div className="glyph">¶</div>
      <h1>Start writing</h1>
      <p>
        Open any markdown file, or press <kbd>⌘N</kbd> for a blank page.
      </p>
      <div className="row">
        <button className="big-btn primary" onClick={() => newTab()}>
          New file
        </button>
        <button className="big-btn" onClick={openFileDialog}>
          Open file…
        </button>
        <button className="big-btn" onClick={openFolderDialog}>
          Open folder…
        </button>
      </div>
    </div>
  );
}
