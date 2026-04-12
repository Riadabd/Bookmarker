import type {
  BookmarkTreeNode,
  FolderEntry,
  FolderIndex,
} from "./types.js";

const ROOT_LABELS: Record<string, string> = {
  root________: "Root",
  toolbar_____: "Bookmarks Toolbar",
  menu________: "Bookmarks Menu",
  mobile______: "Mobile Bookmarks",
  unfiled_____: "Other Bookmarks",
};

export function buildFolderIndex(tree: BookmarkTreeNode[]): FolderIndex {
  const index: FolderIndex = {
    allFolders: [],
    folderLookup: new Map<string, FolderEntry>(),
  };

  for (const node of tree) {
    if (node.children) {
      collectFolders(index, node.children, []);
    }
  }

  return index;
}

export function getDefaultFolders(
  index: FolderIndex,
  limit: number
): FolderEntry[] {
  return index.allFolders.slice(0, limit);
}

export function searchFolders(
  index: FolderIndex,
  query: string,
  limit: number
): FolderEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return getDefaultFolders(index, limit);
  }

  return index.allFolders
    .filter((folder) => folder.searchKey.includes(normalizedQuery))
    .slice(0, limit);
}

export function formatFolderPath(folder: FolderEntry): string {
  return folder.path.slice(0, -1).join(" / ") || "Root";
}

export function buildCreatedFolderEntry(
  index: FolderIndex,
  parentId: string,
  node: BookmarkTreeNode,
  fallbackTitle: string
): FolderEntry {
  const createdName = node.title?.trim() || fallbackTitle;
  const parentEntry = index.folderLookup.get(parentId);
  const parentPath = parentEntry ? [...parentEntry.path] : [];

  return {
    id: node.id,
    name: createdName,
    path: [...parentPath, createdName],
    searchKey: createdName.toLowerCase(),
  };
}

export function insertCreatedFolder(
  index: FolderIndex,
  parentId: string,
  createdEntry: FolderEntry
): FolderIndex {
  const parentEntry = index.folderLookup.get(parentId);
  const parentIndex = parentEntry
    ? index.allFolders.findIndex((entry) => entry.id === parentEntry.id)
    : -1;

  if (parentIndex >= 0) {
    index.allFolders.splice(parentIndex + 1, 0, createdEntry);
  } else {
    index.allFolders.unshift(createdEntry);
  }

  index.folderLookup.set(createdEntry.id, createdEntry);
  return index;
}

function collectFolders(
  index: FolderIndex,
  nodes: BookmarkTreeNode[],
  trail: string[]
): void {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue;
    }

    const label = resolveFolderName(node);
    const nextTrail = [...trail, label];

    if (node.id !== "root________") {
      const entry: FolderEntry = {
        id: node.id,
        name: label,
        path: nextTrail,
        searchKey: label.toLowerCase(),
      };
      index.allFolders.push(entry);
      index.folderLookup.set(node.id, entry);
    }

    if (node.children) {
      collectFolders(index, node.children, nextTrail);
    }
  }
}

function resolveFolderName(node: BookmarkTreeNode): string {
  if (node.title && node.title.trim().length > 0) {
    return node.title;
  }

  return ROOT_LABELS[node.id] ?? "Unnamed folder";
}
