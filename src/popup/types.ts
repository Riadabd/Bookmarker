export type BookmarkTreeNode = browser.bookmarks.BookmarkTreeNode;

export type FolderEntry = {
  id: string;
  name: string;
  path: string[];
  searchKey: string;
};

export type FolderIndex = {
  allFolders: FolderEntry[];
  folderLookup: Map<string, FolderEntry>;
};

export type ActiveTabDetails = {
  title?: string;
  url?: string;
};

export type SaveFailureReconciliation = {
  refreshed: boolean;
  remainingCount: number;
  succeededCount: number;
};

export type CreatedFolderNotification = {
  parentId: string;
  folder: BookmarkTreeNode;
  requestedTitle: string;
};
