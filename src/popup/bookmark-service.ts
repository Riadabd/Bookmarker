import type { ActiveTabDetails, BookmarkTreeNode } from "./types.js";

export type BookmarkService = {
  getActiveTabDetails: () => Promise<ActiveTabDetails>;
  loadBookmarkTree: () => Promise<BookmarkTreeNode[]>;
  findExistingBookmarkFolderIds: (url: string) => Promise<Set<string>>;
  createFolder: (parentId: string, title: string) => Promise<BookmarkTreeNode>;
  createBookmarks: (
    folderIds: string[],
    title: string,
    url: string
  ) => Promise<ReadonlyMap<string, unknown>>;
};

export function createBookmarkService(): BookmarkService {
  return {
    getActiveTabDetails,
    loadBookmarkTree,
    findExistingBookmarkFolderIds,
    createFolder,
    createBookmarks,
  };
}

async function getActiveTabDetails(): Promise<ActiveTabDetails> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return {
    title: activeTab?.title,
    url: activeTab?.url,
  };
}

async function loadBookmarkTree(): Promise<BookmarkTreeNode[]> {
  return browser.bookmarks.getTree();
}

async function findExistingBookmarkFolderIds(url: string): Promise<Set<string>> {
  const folderIds = new Set<string>();

  for (const bookmark of await browser.bookmarks.search(url)) {
    if (bookmark.url !== url || !bookmark.parentId) {
      continue;
    }

    folderIds.add(bookmark.parentId);
  }

  return folderIds;
}

async function createFolder(
  parentId: string,
  title: string
): Promise<BookmarkTreeNode> {
  return browser.bookmarks.create({
    parentId,
    title,
    type: "folder",
  });
}

async function createBookmarks(
  folderIds: string[],
  title: string,
  url: string
): Promise<ReadonlyMap<string, unknown>> {
  const failures = new Map<string, unknown>();

  await Promise.all(
    folderIds.map(async (parentId) => {
      try {
        await browser.bookmarks.create({
          parentId,
          title,
          url,
          type: "bookmark",
        });
      } catch (error: unknown) {
        failures.set(parentId, error);
      }
    })
  );

  return failures;
}
