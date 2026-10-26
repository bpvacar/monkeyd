// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import * as backend from "./backend";
import { useStore, type Tab } from "../store";
import { checkTabsAgainstDisk } from "./sync";

vi.mock("./backend", () => ({ fileStamp: vi.fn(), readTextFile: vi.fn() }));

const tab = (over: Partial<Tab>): Tab => ({
  id: "t1",
  path: "/vault/note.md",
  title: "note.md",
  content: "edited",
  savedContent: "original",
  mode: "wysiwyg",
  diskStamp: "1:8",
  conflict: false,
  reloadNonce: 0,
  ...over,
});

beforeEach(() => {
  vi.mocked(backend.readTextFile).mockReset();
  useStore.setState({ tabs: [tab({})], activeTabId: "t1" });
});

test("our own autosave finishing mid-check is not a conflict", async () => {
  vi.mocked(backend.fileStamp).mockImplementation(async () => {
    // the save lands while the stamp is in flight, exactly as saveTab does it
    useStore.getState().markSaved("t1", "edited");
    useStore.getState().setDiskStamp("t1", "2:6");
    return "2:6";
  });
  await checkTabsAgainstDisk();
  expect(useStore.getState().tabs[0].conflict).toBe(false);
});

test("an outside edit while the tab is dirty is still a conflict", async () => {
  vi.mocked(backend.fileStamp).mockResolvedValue("3:9");
  await checkTabsAgainstDisk();
  expect(useStore.getState().tabs[0].conflict).toBe(true);
  expect(useStore.getState().tabs[0].content).toBe("edited");
});
