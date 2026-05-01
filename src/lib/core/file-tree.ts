// Pure file-tree helpers (Q18). No Tauri imports — types and helpers
// shared between the IPC layer (which receives the Rust-side tree) and
// the React explorer component (which classifies icons + prunes empty
// folders for VSCode parity).

import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import type { Extension } from "@codemirror/state";

export type TreeNode =
  | { kind: "file"; path: string; name: string }
  | {
      kind: "folder";
      path: string;
      name: string;
      children: TreeNode[];
      truncated: number;
    };

export type FolderTree = {
  rootPath: string;
  rootName: string;
  children: TreeNode[];
  truncated: number;
};

// Mirrors the allowlist in `ipc.ts` for the file-picker filter. A file
// is "loadable" iff its extension is in this set, OR (special case)
// the bare filename matches a known text-like name with no extension.
export const TEXT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  "txt",
  "md",
  "log",
  "rs",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "json",
  "yml",
  "yaml",
  "toml",
]);

/** Lowercased extension without the leading dot. Files with no
 * extension return "". Dotfiles like `.gitignore` return "gitignore". */
export function fileExtension(name: string): string {
  if (name.length === 0) return "";
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  // Dotfile (".gitignore"): treat the whole name-after-dot as the ext.
  if (idx === 0) return name.slice(1).toLowerCase();
  return name.slice(idx + 1).toLowerCase();
}

export function isTextFile(name: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(fileExtension(name));
}

// Drives both the lucide icon component and the per-extension tint.
// All kinds are clickable (Q20); the UTF-8 check happens at read time.
export type IconKind =
  | "ts"
  | "rs"
  | "py"
  | "go"
  | "js"
  | "json"
  | "yaml"
  | "md"
  | "html"
  | "css"
  | "shell"
  | "dockerfile"
  | "env"
  | "text";

/** Classify a file by name → which lucide icon to draw and which tint
 * (if any) to apply. Folders are handled separately by the renderer. */
export function classifyIcon(name: string): IconKind {
  // Filename special cases first.
  if (name === "Dockerfile") return "dockerfile";
  if (name === ".env" || name.startsWith(".env.")) return "env";

  const ext = fileExtension(name);
  switch (ext) {
    case "ts":
    case "tsx":
      return "ts";
    case "rs":
      return "rs";
    case "py":
      return "py";
    case "go":
      return "go";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "js";
    case "json":
    case "json5":
    case "jsonc":
      return "json";
    case "yaml":
    case "yml":
    case "toml":
      return "yaml";
    case "md":
    case "markdown":
      return "md";
    case "html":
    case "htm":
      return "html";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "txt":
    case "log":
      return "text";
    default:
      // Q20 — unknown extensions (and no-extension files like
      // `Makefile`, `.bashrc`) get the generic text icon. Whether the
      // file actually IS text is decided at click time by trying to
      // read it; the allowlist no longer gates clickability.
      return "text";
  }
}

export function isExpanded(set: ReadonlySet<string>, path: string): boolean {
  return set.has(path);
}

/** Return a NEW Set with `path` toggled. Doesn't mutate the input
 * (React-friendly). */
export function toggleExpanded(set: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(set);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

/** Strip empty folders so the rendered tree matches VSCode parity. A
 * folder is considered empty iff (a) it has no children AND (b)
 * truncated === 0 (a depth-truncated folder is NOT empty — keeping it
 * communicates to the user that a deeper subtree was elided). */
export function pruneEmptyFolders(tree: FolderTree): FolderTree {
  return { ...tree, children: pruneNodes(tree.children) };
}

// Q22 — language autodetection for the CodeMirror text panel. Mirrors
// `classifyIcon`'s extension lookup. Returns `null` for null/unknown/
// no-extension; the editor mounts as plain text in that case. Adding a
// new language: add the dep, add the case here.
export function pickLanguage(name: string | null): Extension | null {
  if (name === null) return null;
  const ext = fileExtension(name);
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: ext === "jsx" });
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "py":
      return python();
    case "rs":
      return rust();
    case "json":
    case "json5":
    case "jsonc":
      return json();
    case "md":
    case "markdown":
      return markdown();
    default:
      return null;
  }
}

function pruneNodes(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      out.push(node);
      continue;
    }
    const prunedChildren = pruneNodes(node.children);
    // Empty folder = no children left AND nothing was truncated.
    if (prunedChildren.length === 0 && node.truncated === 0) continue;
    out.push({ ...node, children: prunedChildren });
  }
  return out;
}
