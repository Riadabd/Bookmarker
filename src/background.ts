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

type RuntimeMessage =
  | CreateBookmarksMessage
  | CreateFolderMessage
  | { type: string }
  | undefined
  | null;

function isCreateBookmarksMessage(
  message: RuntimeMessage
): message is CreateBookmarksMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  if (message.type !== "create-bookmarks") {
    return false;
  }

  // Guard against malformed messages so the listener never crashes when payload is missing.
  if (!("payload" in message)) {
    return false;
  }

  const payload = (message as CreateBookmarksMessage).payload;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return Array.isArray(payload.folders);
}

function isCreateFolderMessage(
  message: RuntimeMessage
): message is CreateFolderMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  if (message.type !== "create-folder") {
    return false;
  }

  if (!("payload" in message)) {
    return false;
  }

  const payload = (message as CreateFolderMessage).payload;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return (
    typeof payload.parentId === "string" &&
    payload.parentId.length > 0 &&
    typeof payload.title === "string"
  );
}

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (isCreateBookmarksMessage(message)) {
    const { folders, title, url } = message.payload;
    if (!folders?.length || !url) {
      return undefined;
    }

    // Perform the writes asynchronously so the popup can close without waiting.
    return createBookmarks(folders, title, url).catch((error) => {
      console.error("Failed to create bookmarks", error);
      throw error;
    });
  }

  if (isCreateFolderMessage(message)) {
    const { parentId, title } = message.payload;
    if (!parentId || !title) {
      return undefined;
    }

    return createFolder(parentId, title).catch((error) => {
      console.error("Failed to create folder", error);
      throw error;
    });
  }

  return undefined;
});

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
