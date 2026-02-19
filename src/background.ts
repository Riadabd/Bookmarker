/// <reference types="firefox-webext-browser" />

type BookmarkNode = browser.bookmarks.BookmarkTreeNode;

type CreateBookmarksMessage = {
  type: "create-bookmarks";
  payload: {
    folders: string[];
    title: string;
    url: string;
  };
};

type CreateFolderMessage = {
  type: "create-folder";
  payload: {
    parentId: string;
    title: string;
  };
};

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isCreateBookmarksMessage(message: unknown): message is CreateBookmarksMessage {
  if (!isUnknownRecord(message)) {
    return false;
  }
  if (message.type !== "create-bookmarks") {
    return false;
  }

  const payload = message.payload;
  if (!isUnknownRecord(payload)) {
    return false;
  }

  const folders = payload.folders;
  if (!Array.isArray(folders) || !folders.every((folder) => typeof folder === "string")) {
    return false;
  }

  return typeof payload.title === "string" && typeof payload.url === "string";
}

function isCreateFolderMessage(message: unknown): message is CreateFolderMessage {
  if (!isUnknownRecord(message)) {
    return false;
  }
  if (message.type !== "create-folder") {
    return false;
  }

  const payload = message.payload;
  if (!isUnknownRecord(payload)) {
    return false;
  }

  return (
    typeof payload.parentId === "string" &&
    payload.parentId.length > 0 &&
    typeof payload.title === "string"
  );
}

browser.runtime.onMessage.addListener(
  (message: unknown): Promise<BookmarkNode | void> | undefined => {
    if (isCreateBookmarksMessage(message)) {
      const { folders, title, url } = message.payload;
      if (!folders?.length || !url) {
        return undefined;
      }

      // Perform the writes asynchronously so the popup can close without waiting.
      return createBookmarks(folders, title, url).catch((error: unknown) => {
        console.error("Failed to create bookmarks", error);
        throw error;
      });
    }

    if (isCreateFolderMessage(message)) {
      const { parentId, title } = message.payload;
      if (!parentId || !title) {
        return undefined;
      }

      return createFolder(parentId, title).catch((error: unknown) => {
        console.error("Failed to create folder", error);
        throw error;
      });
    }

    return undefined;
  }
);

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

async function createFolder(
  parentId: string,
  title: string
): Promise<BookmarkNode> {
  return browser.bookmarks.create({ parentId, title, type: "folder" });
}
