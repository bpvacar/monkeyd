import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Tauri's native drop handling is off so the editors get dropped images as
// DOM events. A file dropped anywhere else would make the webview navigate to
// it and lose every open tab, so outside the editors a file drop is refused.
const refuseFileDrop = (e: DragEvent) => {
  if (e.defaultPrevented || !e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "none";
};
window.addEventListener("dragover", refuseFileDrop);
window.addEventListener("drop", refuseFileDrop);

// StrictMode is intentionally omitted: its dev-mode double-mount races the
// async lifecycle of the Milkdown/CodeMirror editor instances.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
