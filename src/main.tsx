import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode is intentionally omitted: its dev-mode double-mount races the
// async lifecycle of the Milkdown/CodeMirror editor instances.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
