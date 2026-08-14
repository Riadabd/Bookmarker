import type { ActiveTabDetails, BookmarkTreeNode } from "./types.js";

type PopupRecord = Record<string, unknown>;

export type BookmarkService = {
  getActiveTabDetails: () => Promise<ActiveTabDetails>;
  loadBookmarkTree: () => Promise<BookmarkTreeNode[]>;
  findExistingBookmarkFolderIds: (url: string) => Promise<Set<string>>;
  createFolder: (parentId: string, title: string) => Promise<BookmarkTreeNode>;
  createBookmarks: (
    folderIds: string[],
    title: string,
    url: string
  ) => Promise<void>;
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
  const existingBookmarks = await findExistingBookmarks(url);
  const folderIds = new Set<string>();

  for (const bookmark of existingBookmarks) {
    if (!bookmark.parentId) {
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
): Promise<void> {
  await Promise.all(
    folderIds.map((parentId) =>
      browser.bookmarks.create({ parentId, title, url, type: "bookmark" })
    )
  );
}

async function findExistingBookmarks(url: string): Promise<BookmarkTreeNode[]> {
  try {
    return await browser.bookmarks.search({ url: url });
  } catch (error: unknown) {
    if (!isInvalidUrlQueryError(error)) {
      throw error;
    }
  }

  const results = await browser.bookmarks.search(url);
  return results.filter((bookmark) => bookmark.url === url);
}

function isInvalidUrlQueryError(error: unknown): boolean {
  if (error instanceof Error) {
    if (
      error.name === "TypeError" &&
      error.message.includes('.url must match the format "url"')
    ) {
      return true;
    }
  }

  if (!isPopupRecord(error) || !("message" in error)) {
    return false;
  }

  const message = String(error.message ?? "");
  return message.includes('.url must match the format "url"');
}

function isPopupRecord(value: unknown): value is PopupRecord {
  return typeof value === "object" && value !== null;
}
