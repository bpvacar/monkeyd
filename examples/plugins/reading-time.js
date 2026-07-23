// Example plugin: shows estimated reading time for the open document.
// Install: copy this file into the app's plugins folder
// (Plugins & appearance → Open plugins folder), then relaunch.

mdeditor.registerCommand("reading-time", {
  title: "Show reading time",
  run() {
    const doc = mdeditor.getActiveDocument();
    if (!doc) {
      mdeditor.toast("No document open");
      return;
    }
    const words = (doc.content.match(/\S+/g) || []).length;
    const minutes = Math.max(1, Math.round(words / 220));
    mdeditor.toast(`~${minutes} min read (${words} words)`);
  },
});

// Stamp exported PDFs/HTML with a footer.
mdeditor.transformMarkdownForExport(
  (md) => md + "\n\n---\n\n*Exported from mdeditor*"
);
