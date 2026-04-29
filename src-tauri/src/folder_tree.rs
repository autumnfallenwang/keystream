//! `read_folder_tree` Tauri command for the v2-8 file explorer (Q18).
//!
//! Walks a directory iteratively (no `walkdir` dep) with:
//! - hardcoded hidden-name skip list (`.git`, `node_modules`, etc.)
//! - depth cap (6 levels)
//! - per-folder child cap (500)
//! - folders sorted before files, then case-insensitive alphabetical
//!
//! Per `rules/security.md`: log counts only — never user-file names.

use std::fs;
use std::path::Path;

use serde::Serialize;

const MAX_DEPTH: usize = 6;
const MAX_CHILDREN_PER_FOLDER: usize = 500;

const HIDDEN_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".next",
    ".svelte-kit",
    ".DS_Store",
    ".vscode",
    ".idea",
];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TreeNode {
    #[serde(rename = "file")]
    File { path: String, name: String },
    #[serde(rename = "folder")]
    Folder {
        path: String,
        name: String,
        children: Vec<TreeNode>,
        truncated: u64,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderTree {
    pub root_path: String,
    pub root_name: String,
    pub children: Vec<TreeNode>,
    pub truncated: u64,
}

#[tauri::command]
pub fn read_folder_tree(path: String) -> Result<FolderTree, String> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("could not resolve path: {e}"))?;

    let metadata = canonical
        .metadata()
        .map_err(|e| format!("could not stat path: {e}"))?;
    if !metadata.is_dir() {
        return Err("path is not a directory".to_string());
    }

    let root_name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| canonical.to_string_lossy().into_owned());
    let root_path = canonical.to_string_lossy().into_owned();

    let mut counts = Counts::default();
    let (children, truncated) = read_dir_capped(&canonical, 0, &mut counts);

    log::info!(
        "read_folder_tree: files={} folders={} truncated_folders={}",
        counts.files,
        counts.folders,
        counts.truncated_folders
    );

    Ok(FolderTree {
        root_path,
        root_name,
        children,
        truncated,
    })
}

#[derive(Default)]
struct Counts {
    files: u64,
    folders: u64,
    truncated_folders: u64,
}

/// Read the children of `dir` and return up to MAX_CHILDREN_PER_FOLDER nodes
/// plus the truncated count (entries seen beyond the cap).
fn read_dir_capped(dir: &Path, depth: usize, counts: &mut Counts) -> (Vec<TreeNode>, u64) {
    let entries = match fs::read_dir(dir) {
        Ok(it) => it,
        Err(_) => return (Vec::new(), 0),
    };

    // Collect (is_dir, name, path) up to MAX+1 entries so we can detect overflow.
    // Skipping hidden names happens here, before sorting.
    let mut visible: Vec<(bool, String, std::path::PathBuf)> = Vec::new();
    let mut total_visible: u64 = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if HIDDEN_NAMES.contains(&name.as_str()) {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let is_dir = file_type.is_dir();
        // Treat symlinks as their target only if it's a file; otherwise skip.
        if !is_dir && !file_type.is_file() {
            continue;
        }
        total_visible += 1;
        if visible.len() < MAX_CHILDREN_PER_FOLDER {
            visible.push((is_dir, name, entry.path()));
        }
    }

    let truncated = total_visible.saturating_sub(visible.len() as u64);

    // Sort: folders first, then files; case-insensitive name within each.
    visible.sort_by(|a, b| match (a.0, b.0) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.1.to_lowercase().cmp(&b.1.to_lowercase()),
    });

    let mut nodes: Vec<TreeNode> = Vec::with_capacity(visible.len());
    for (is_dir, name, child_path) in visible {
        let path_str = child_path.to_string_lossy().into_owned();
        if is_dir {
            counts.folders += 1;
            // Depth cap: at depth >= MAX_DEPTH-1, the children of THIS folder
            // would be at depth MAX_DEPTH. We stop one level early so the
            // folder appears in the tree (with truncated:1) but isn't walked.
            if depth + 1 >= MAX_DEPTH {
                counts.truncated_folders += 1;
                nodes.push(TreeNode::Folder {
                    path: path_str,
                    name,
                    children: Vec::new(),
                    truncated: 1,
                });
            } else {
                let (children, sub_truncated) = read_dir_capped(&child_path, depth + 1, counts);
                if sub_truncated > 0 {
                    counts.truncated_folders += 1;
                }
                nodes.push(TreeNode::Folder {
                    path: path_str,
                    name,
                    children,
                    truncated: sub_truncated,
                });
            }
        } else {
            counts.files += 1;
            nodes.push(TreeNode::File {
                path: path_str,
                name,
            });
        }
    }

    (nodes, truncated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn fresh_tmp(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("kstest_folder_tree_{name}"));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn child_names(nodes: &[TreeNode]) -> Vec<String> {
        nodes
            .iter()
            .map(|n| match n {
                TreeNode::File { name, .. } | TreeNode::Folder { name, .. } => name.clone(),
            })
            .collect()
    }

    #[test]
    fn errors_on_missing_path() {
        let path = std::env::temp_dir().join("kstest_folder_tree_definitely_missing");
        let _ = fs::remove_dir_all(&path);
        let err = read_folder_tree(path.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("resolve path"), "got: {err}");
    }

    #[test]
    fn errors_on_file_path() {
        let dir = fresh_tmp("file_path");
        let file = dir.join("a.txt");
        fs::write(&file, b"x").unwrap();
        let err = read_folder_tree(file.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("not a directory"), "got: {err}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_simple_directory() {
        let dir = fresh_tmp("simple");
        fs::write(dir.join("c.txt"), b"").unwrap();
        fs::write(dir.join("a.txt"), b"").unwrap();
        fs::write(dir.join("b.txt"), b"").unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(child_names(&tree.children), vec!["a.txt", "b.txt", "c.txt"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn folders_sort_before_files() {
        let dir = fresh_tmp("folders_first");
        fs::write(dir.join("aaa.txt"), b"").unwrap();
        fs::create_dir(dir.join("zzz_dir")).unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(child_names(&tree.children), vec!["zzz_dir", "aaa.txt"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn case_insensitive_sort() {
        let dir = fresh_tmp("case_sort");
        fs::write(dir.join("Banana.txt"), b"").unwrap();
        fs::write(dir.join("apple.txt"), b"").unwrap();
        fs::write(dir.join("Cherry.txt"), b"").unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(
            child_names(&tree.children),
            vec!["apple.txt", "Banana.txt", "Cherry.txt"]
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn skips_hidden_names_at_top() {
        let dir = fresh_tmp("hidden_top");
        fs::create_dir(dir.join(".git")).unwrap();
        fs::create_dir(dir.join("node_modules")).unwrap();
        fs::create_dir(dir.join("target")).unwrap();
        fs::create_dir(dir.join(".next")).unwrap();
        fs::write(dir.join(".DS_Store"), b"").unwrap();
        fs::write(dir.join("visible.txt"), b"").unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(child_names(&tree.children), vec!["visible.txt"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn skips_hidden_names_nested() {
        let dir = fresh_tmp("hidden_nested");
        let sub = dir.join("sub");
        fs::create_dir(&sub).unwrap();
        fs::create_dir(sub.join(".git")).unwrap();
        fs::write(sub.join("real.txt"), b"").unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        let TreeNode::Folder { children, .. } = &tree.children[0] else {
            panic!("expected folder at top level")
        };
        assert_eq!(child_names(children), vec!["real.txt"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn respects_depth_cap() {
        let dir = fresh_tmp("depth");
        // 8 levels: dir/L1/L2/L3/L4/L5/L6/L7/L8/leaf.txt
        let mut p = dir.clone();
        for i in 1..=8 {
            p = p.join(format!("L{i}"));
            fs::create_dir(&p).unwrap();
        }
        fs::write(p.join("leaf.txt"), b"").unwrap();

        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();

        // Walk down counting until truncation.
        let mut node = &tree.children[0];
        let mut levels_with_children = 0;
        while let TreeNode::Folder {
            children,
            truncated,
            ..
        } = node
        {
            if *truncated > 0 {
                // truncated folder must have empty children
                assert!(
                    children.is_empty(),
                    "truncated folder must have no children"
                );
                break;
            }
            levels_with_children += 1;
            if children.is_empty() {
                break;
            }
            node = &children[0];
        }
        // Tree exposes folders down to MAX_DEPTH-1 with children, the deepest
        // emitted folder at depth = MAX_DEPTH-1 has truncated:1 and no children.
        assert!(
            levels_with_children >= MAX_DEPTH - 1,
            "expected at least {} levels, got {}",
            MAX_DEPTH - 1,
            levels_with_children
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn respects_per_folder_cap() {
        let dir = fresh_tmp("per_folder_cap");
        // Create 600 files. MAX_CHILDREN_PER_FOLDER = 500 → truncated = 100.
        for i in 0..600 {
            fs::write(dir.join(format!("f{i:04}.txt")), b"").unwrap();
        }
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(tree.children.len(), MAX_CHILDREN_PER_FOLDER);
        assert_eq!(tree.truncated, 100);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_folder_kept_in_tree() {
        let dir = fresh_tmp("empty_kept");
        fs::create_dir(dir.join("empty_sub")).unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(tree.children.len(), 1);
        if let TreeNode::Folder {
            children,
            truncated,
            ..
        } = &tree.children[0]
        {
            assert!(children.is_empty());
            assert_eq!(*truncated, 0);
        } else {
            panic!("expected folder");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn name_field_set_correctly() {
        let dir = fresh_tmp("named_root");
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        assert!(tree.root_name.starts_with("kstest_folder_tree_named_root"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unicode_filenames_roundtrip() {
        let dir = fresh_tmp("unicode");
        fs::write(dir.join("héllo.txt"), b"").unwrap();
        fs::write(dir.join("世界.md"), b"").unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        let names = child_names(&tree.children);
        assert!(names.contains(&"héllo.txt".to_string()));
        assert!(names.contains(&"世界.md".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn serde_serializes_kind_tagged() {
        let dir = fresh_tmp("serde_tag");
        fs::write(dir.join("a.txt"), b"").unwrap();
        fs::create_dir(dir.join("sub")).unwrap();
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        let json = serde_json::to_value(&tree).unwrap();
        let arr = json.get("children").unwrap().as_array().unwrap();
        let kinds: Vec<&str> = arr.iter().map(|n| n["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, vec!["folder", "file"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn serde_emits_camel_case_root_fields() {
        let dir = fresh_tmp("camel_root");
        let tree = read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
        let json = serde_json::to_value(&tree).unwrap();
        assert!(json.get("rootPath").is_some());
        assert!(json.get("rootName").is_some());
        assert!(json.get("children").is_some());
        assert!(json.get("truncated").is_some());
        let _ = fs::remove_dir_all(&dir);
    }
}
