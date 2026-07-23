import { useStore } from "../store";

function countWords(md: string): number {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-\[\]()!|]/g, " ");
  return (text.match(/\S+/g) ?? []).length;
}

export default function StatusBar() {
  const tab = useStore((s) => s.activeTab());
  if (!tab) return <footer className="statusbar" />;

  const dirty = tab.content !== tab.savedContent;
  const words = countWords(tab.content);

  return (
    <footer className="statusbar">
      <span>{words.toLocaleString()} words</span>
      <span>{tab.content.length.toLocaleString()} characters</span>
      <span className="spacer" />
      <span>{tab.mode === "wysiwyg" ? "Rich text" : "Source"}</span>
      <span className={`save-state ${dirty ? "" : "saved"}`}>
        {tab.path === null ? "Not saved yet" : dirty ? "Edited" : "Saved"}
      </span>
    </footer>
  );
}
