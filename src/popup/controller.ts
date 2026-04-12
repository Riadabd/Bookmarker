import type { BookmarkService } from "./bookmark-service.js";
import type { PopupElements } from "./dom.js";
import {
  buildCreatedFolderEntry,
  buildFolderIndex,
  getDefaultFolders,
  insertCreatedFolder,
  searchFolders,
} from "./folder-index.js";
import type { MainFolderList } from "./main-folder-list.js";
import type {
  ActiveTabDetails,
  CreatedFolderNotification,
  FolderEntry,
  FolderIndex,
  SaveFailureReconciliation,
} from "./types.js";

type PopupControllerOptions = {
  elements: PopupElements;
  service: BookmarkService;
  mainFolderList: MainFolderList;
};

export type PopupController = {
  bootstrap: () => Promise<void>;
  getFolderIndex: () => FolderIndex;
  handleMainSelectionChange: (
    folderId: string,
    shouldSelect: boolean
  ) => void;
  handleCreatedFolder: (notification: CreatedFolderNotification) => void;
};

type PopupRecord = Record<string, unknown>;

export function createPopupController(
  options: PopupControllerOptions
): PopupController {
  const { elements, service, mainFolderList } = options;
  const { mainPicker, footer } = elements;

  let activeTab: ActiveTabDetails = {};
  let folderIndex: FolderIndex = {
    allFolders: [],
    folderLookup: new Map<string, FolderEntry>(),
  };
  const selectedFolderIds = new Set<string>();
  const existingBookmarkFolderIds = new Set<string>();
  let currentMainResults: FolderEntry[] = [];

  function handleMainSelectionChange(
    folderId: string,
    shouldSelect: boolean
  ): void {
    if (shouldSelect) {
      selectedFolderIds.add(folderId);
    } else {
      selectedFolderIds.delete(folderId);
    }

    renderMainResults(currentMainResults);
  }

  function handleCreatedFolder(notification: CreatedFolderNotification): void {
    const newEntry = buildCreatedFolderEntry(
      folderIndex,
      notification.parentId,
      notification.folder,
      notification.requestedTitle
    );

    insertCreatedFolder(folderIndex, notification.parentId, newEntry);
    selectedFolderIds.add(newEntry.id);

    mainPicker.searchInput.value = "";
    updateSearchClearButtonState();

    const refreshedResults = [
      newEntry,
      ...currentMainResults.filter((folder) => folder.id !== newEntry.id),
    ].slice(0, 50);

    renderMainResults(refreshedResults);
    mainPicker.searchInput.focus();
  }

  async function bootstrap(): Promise<void> {
    await populateTabDetails();
    await loadFolders();
    await discoverExistingBookmarks();
    wireEvents();
    renderMainResults(getDefaultFolders(folderIndex, 25));
    mainPicker.searchInput.focus();
    footer.removeButton.disabled = true;
    updateSaveButtonState();
    updateSearchClearButtonState();
  }

  function getFolderIndex(): FolderIndex {
    return folderIndex;
  }

  async function populateTabDetails(): Promise<void> {
    try {
      activeTab = await service.getActiveTabDetails();
      if (activeTab.title) {
        mainPicker.nameInput.value = activeTab.title;
      }
    } catch (error: unknown) {
      console.error("Failed to resolve active tab", error);
    }
  }

  async function loadFolders(): Promise<void> {
    try {
      const tree = await service.loadBookmarkTree();
      folderIndex = buildFolderIndex(tree);
    } catch (error: unknown) {
      console.error("Failed to read bookmarks", error);
    }
  }

  async function discoverExistingBookmarks(): Promise<void> {
    if (!activeTab.url) {
      return;
    }

    try {
      const existingIds = await service.findExistingBookmarkFolderIds(
        activeTab.url
      );
      replaceSet(existingBookmarkFolderIds, existingIds);
    } catch (error: unknown) {
      console.error("Failed to detect existing bookmarks", error);
    }
  }

  function wireEvents(): void {
    mainPicker.searchInput.addEventListener("input", () => {
      const query = mainPicker.searchInput.value;
      const results = query.trim()
        ? searchFolders(folderIndex, query, 100)
        : getDefaultFolders(folderIndex, 50);

      renderMainResults(results);
      updateSearchClearButtonState();
    });

    mainPicker.searchInput.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        if (event.key !== "Enter") {
          return;
        }

        event.preventDefault();
        if (currentMainResults.length === 0) {
          return;
        }

        for (const folder of currentMainResults) {
          if (existingBookmarkFolderIds.has(folder.id)) {
            continue;
          }

          selectedFolderIds.add(folder.id);
        }

        mainPicker.searchInput.value = "";
        mainPicker.searchInput.focus();
        renderMainResults(getDefaultFolders(folderIndex, 50));
        updateSearchClearButtonState();
      }
    );

    mainPicker.searchClearButton.addEventListener("click", () => {
      if (!mainPicker.searchInput.value) {
        mainPicker.searchInput.focus();
        return;
      }

      mainPicker.searchInput.value = "";
      renderMainResults(getDefaultFolders(folderIndex, 50));
      updateSearchClearButtonState();
      mainPicker.searchInput.focus();
    });

    footer.saveButton.addEventListener("click", async () => {
      await saveBookmarks();
    });
  }

  function renderMainResults(folders: FolderEntry[]): void {
    currentMainResults = folders;
    mainFolderList.render(currentMainResults, {
      selectedIds: selectedFolderIds,
      existingIds: existingBookmarkFolderIds,
    });
    updateSaveButtonState();
  }

  async function saveBookmarks(): Promise<void> {
    if (selectedFolderIds.size === 0) {
      return;
    }

    clearSaveError();
    footer.saveButton.disabled = true;

    let activeTabBookmarkUrl = activeTab.url;
    let attemptedFolderIds: string[] = [];

    try {
      activeTab = await service.getActiveTabDetails();
      if (!activeTab.url) {
        throw new Error("Active tab is missing URL");
      }

      activeTabBookmarkUrl = activeTab.url;

      const title =
        mainPicker.nameInput.value.trim() || activeTab.title || activeTab.url;
      const targetFolders = Array.from(selectedFolderIds);
      attemptedFolderIds = targetFolders;

      if (targetFolders.length === 0) {
        window.close();
        return;
      }

      await service.createBookmarks(targetFolders, title, activeTab.url);

      for (const folderId of targetFolders) {
        existingBookmarkFolderIds.add(folderId);
      }

      window.close();
    } catch (error: unknown) {
      console.error("Failed to save bookmarks", error);
      const reconciliation =
        activeTabBookmarkUrl && attemptedFolderIds.length > 0
          ? await reconcileSaveFailure(activeTabBookmarkUrl, attemptedFolderIds)
          : {
              refreshed: false,
              remainingCount: attemptedFolderIds.length,
              succeededCount: 0,
            };

      showSaveError(buildSaveErrorMessage(error, reconciliation));
    } finally {
      updateSaveButtonState();
    }
  }

  async function reconcileSaveFailure(
    url: string,
    attemptedFolderIds: string[]
  ): Promise<SaveFailureReconciliation> {
    try {
      const existingIds = await service.findExistingBookmarkFolderIds(url);
      replaceSet(existingBookmarkFolderIds, existingIds);

      selectedFolderIds.clear();
      for (const folderId of attemptedFolderIds) {
        if (existingBookmarkFolderIds.has(folderId)) {
          continue;
        }

        selectedFolderIds.add(folderId);
      }

      renderMainResults(currentMainResults);

      return {
        refreshed: true,
        remainingCount: selectedFolderIds.size,
        succeededCount: attemptedFolderIds.length - selectedFolderIds.size,
      };
    } catch (refreshError: unknown) {
      console.error(
        "Failed to refresh bookmark state after save failure",
        refreshError
      );

      return {
        refreshed: false,
        remainingCount: attemptedFolderIds.length,
        succeededCount: 0,
      };
    }
  }

  function updateSaveButtonState(): void {
    footer.saveButton.disabled = selectedFolderIds.size === 0;
  }

  function updateSearchClearButtonState(): void {
    mainPicker.searchClearButton.hidden = mainPicker.searchInput.value.length === 0;
  }

  function clearSaveError(): void {
    footer.saveError.hidden = true;
    footer.saveError.textContent = "";
  }

  function showSaveError(message: string): void {
    footer.saveError.textContent = message;
    footer.saveError.hidden = false;
  }

  return {
    bootstrap,
    getFolderIndex,
    handleMainSelectionChange,
    handleCreatedFolder,
  };
}

function buildSaveErrorMessage(
  error: unknown,
  reconciliation: SaveFailureReconciliation
): string {
  const detail = extractErrorMessage(error);
  const prefix = detail
    ? `Bookmarking failed: ${detail}`
    : "Bookmarking failed.";

  if (!reconciliation.refreshed) {
    return `${prefix} The popup could not confirm which folders succeeded, so close and reopen it before retrying.`;
  }

  if (reconciliation.succeededCount > 0 && reconciliation.remainingCount > 0) {
    return `${prefix} Some selected folders already contain the bookmark. The remaining folders stay selected so you can try again.`;
  }

  if (reconciliation.succeededCount > 0) {
    return `${prefix} Some selected folders already contain the bookmark, and there are no remaining folders left to retry.`;
  }

  return `${prefix} No selected folders appear to contain the bookmark yet. The same folders stay selected so you can try again.`;
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (
    isPopupRecord(error) &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return null;
}

function replaceSet(target: Set<string>, next: ReadonlySet<string>): void {
  target.clear();
  for (const value of next) {
    target.add(value);
  }
}

function isPopupRecord(value: unknown): value is PopupRecord {
  return typeof value === "object" && value !== null;
}
