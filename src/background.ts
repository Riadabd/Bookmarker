/// <reference types="firefox-webext-browser" />

type CreateBookmarksMessage = {
  type: "create-bookmarks";
  payload: {
    folders: string[];
    title: string;
    url: string;
  };
};

type RuntimeMessage =
  | CreateBookmarksMessage
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

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (!isCreateBookmarksMessage(message)) {
    return undefined;
  }

  const { folders, title, url } = message.payload;
  if (!folders?.length || !url) {
    return undefined;
  }

  // Perform the writes asynchronously so the popup can close without waiting.
  return createBookmarks(folders, title, url).catch((error) => {
    console.error("Failed to create bookmarks", error);
    throw error;
  });
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
