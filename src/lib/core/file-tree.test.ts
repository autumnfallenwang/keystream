import { describe, expect, it } from "vitest";
import {
  classifyIcon,
  type FolderTree,
  fileExtension,
  isExpanded,
  isTextFile,
  pruneEmptyFolders,
  type TreeNode,
  toggleExpanded,
} from "./file-tree";

describe("fileExtension", () => {
  it("returns lowercased extension without the dot", () => {
    expect(fileExtension("foo.TXT")).toBe("txt");
    expect(fileExtension("foo.tar.gz")).toBe("gz");
  });
  it("returns '' for files with no extension", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension("")).toBe("");
  });
  it("treats dotfiles as their bare-name extension", () => {
    expect(fileExtension(".gitignore")).toBe("gitignore");
    expect(fileExtension(".env")).toBe("env");
  });
});

describe("isTextFile", () => {
  it.each([
    "a.txt",
    "b.md",
    "c.log",
    "main.rs",
    "App.tsx",
    "App.ts",
    "x.js",
    "y.jsx",
    "z.py",
    "g.go",
    "p.json",
    "config.yml",
    "config.yaml",
    "config.toml",
  ])("recognises %s as a text file", (name) => {
    expect(isTextFile(name)).toBe(true);
  });
  it.each([
    "a.png",
    "b.jpg",
    "c.exe",
    "d.bin",
    "no_ext",
    "weird.xyz",
  ])("rejects %s as a text file", (name) => {
    expect(isTextFile(name)).toBe(false);
  });
});

describe("classifyIcon", () => {
  it("classifies known code extensions", () => {
    expect(classifyIcon("a.ts")).toBe("ts");
    expect(classifyIcon("a.tsx")).toBe("ts");
    expect(classifyIcon("a.rs")).toBe("rs");
    expect(classifyIcon("a.py")).toBe("py");
    expect(classifyIcon("a.go")).toBe("go");
    expect(classifyIcon("a.js")).toBe("js");
    expect(classifyIcon("a.mjs")).toBe("js");
  });
  it("classifies structured-data extensions", () => {
    expect(classifyIcon("a.json")).toBe("json");
    expect(classifyIcon("a.json5")).toBe("json");
    expect(classifyIcon("a.jsonc")).toBe("json");
    expect(classifyIcon("a.yaml")).toBe("yaml");
    expect(classifyIcon("a.yml")).toBe("yaml");
    expect(classifyIcon("a.toml")).toBe("yaml");
  });
  it("classifies markup + style extensions", () => {
    expect(classifyIcon("a.md")).toBe("md");
    expect(classifyIcon("a.html")).toBe("html");
    expect(classifyIcon("a.css")).toBe("css");
    expect(classifyIcon("a.scss")).toBe("css");
  });
  it("classifies shell scripts", () => {
    expect(classifyIcon("a.sh")).toBe("shell");
    expect(classifyIcon("a.bash")).toBe("shell");
    expect(classifyIcon("a.zsh")).toBe("shell");
  });
  it("recognises Dockerfile by exact filename", () => {
    expect(classifyIcon("Dockerfile")).toBe("dockerfile");
  });
  it("recognises .env files", () => {
    expect(classifyIcon(".env")).toBe("env");
    expect(classifyIcon(".env.local")).toBe("env");
    expect(classifyIcon(".env.production")).toBe("env");
  });
  it("falls back to 'text' for plain text-like extensions", () => {
    expect(classifyIcon("notes.txt")).toBe("text");
    expect(classifyIcon("error.log")).toBe("text");
  });
  it("falls back to 'text' for unknown extensions and no-extension files (Q20)", () => {
    // Q20: every file is a try-to-open candidate; unknowns get the
    // generic text icon, not an inert binary one. Whether the file
    // actually IS text is decided at click time.
    expect(classifyIcon("image.png")).toBe("text");
    expect(classifyIcon("a.exe")).toBe("text");
    expect(classifyIcon("Makefile")).toBe("text");
    expect(classifyIcon("no_ext")).toBe("text");
  });
});

describe("isExpanded / toggleExpanded", () => {
  it("toggleExpanded adds when missing and removes when present", () => {
    const a = new Set<string>();
    const b = toggleExpanded(a, "/a");
    expect(b.has("/a")).toBe(true);
    const c = toggleExpanded(b, "/a");
    expect(c.has("/a")).toBe(false);
  });
  it("toggleExpanded does not mutate the input", () => {
    const a = new Set<string>(["/x"]);
    const b = toggleExpanded(a, "/y");
    expect(a.has("/y")).toBe(false);
    expect(b.has("/y")).toBe(true);
  });
  it("isExpanded checks set membership", () => {
    const s = new Set<string>(["/foo"]);
    expect(isExpanded(s, "/foo")).toBe(true);
    expect(isExpanded(s, "/bar")).toBe(false);
  });
});

describe("pruneEmptyFolders", () => {
  function file(path: string): TreeNode {
    const name = path.split("/").pop() ?? path;
    return { kind: "file", path, name };
  }
  function folder(path: string, children: TreeNode[], truncated = 0): TreeNode {
    const name = path.split("/").pop() ?? path;
    return { kind: "folder", path, name, children, truncated };
  }
  function rootOf(children: TreeNode[]): FolderTree {
    return { rootPath: "/r", rootName: "r", children, truncated: 0 };
  }

  it("removes a leaf empty folder", () => {
    const t = rootOf([folder("/r/empty", [])]);
    expect(pruneEmptyFolders(t).children).toEqual([]);
  });
  it("removes a folder whose only descendants are empty folders", () => {
    const t = rootOf([folder("/r/a", [folder("/r/a/b", [])])]);
    expect(pruneEmptyFolders(t).children).toEqual([]);
  });
  it("keeps non-empty folders and the files inside them", () => {
    const t = rootOf([folder("/r/a", [file("/r/a/x.ts")])]);
    const out = pruneEmptyFolders(t).children;
    expect(out).toHaveLength(1);
    const node = out[0];
    if (node === undefined || node.kind !== "folder") throw new Error("expected folder");
    expect(node.children).toHaveLength(1);
  });
  it("keeps a depth-truncated folder even if children is empty", () => {
    const t = rootOf([folder("/r/deep", [], 1)]);
    expect(pruneEmptyFolders(t).children).toHaveLength(1);
  });
  it("keeps top-level files unchanged", () => {
    const t = rootOf([file("/r/a.ts"), folder("/r/empty", [])]);
    const out = pruneEmptyFolders(t).children;
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("file");
  });
});
