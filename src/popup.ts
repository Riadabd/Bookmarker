/// <reference types="firefox-webext-browser" />

type BookmarkTreeNode = browser.bookmarks.BookmarkTreeNode;

type FolderEntry = {
  id: string;
  name: string;
  path: string[];
  pathLabel: string;
};

const nameInput = document.getElementById("bookmark-name") as HTMLInputElement;
const searchInput = document.getElementById(
  "folder-search"
) as HTMLInputElement;
const resultsList = document.getElementById(
  "folder-results"
) as HTMLUListElement;
const saveButton = document.getElementById(
  "save-bookmark"
) as HTMLButtonElement;
const removeButton = document.getElementById(
  "remove-bookmark"
) as HTMLButtonElement;

// Flat lookup table instead of repeatedly traversing the bookmark tree during search.
const allFolders: FolderEntry[] = [];
// Track selections across re-renders so the UI behaves like a multi-select list.
const selectedFolderIds = new Set<string>();
// Track folders that already contain a bookmark for the active tab.
const existingBookmarkFolderIds = new Set<string>();
// Cache currently rendered folders so keyboard shortcuts can act on the visible list.
let currentResults: FolderEntry[] = [];
// Capture the active tab url so we can detect existing bookmarks.
let activeTabUrl: string | undefined;

// Provide friendly labels for root containers that report empty titles in the API.
const ROOT_LABELS: Record<string, string> = {
  root________: "Root",
  toolbar_____: "Bookmarks Toolbar",
  menu________: "Bookmarks Menu",
  mobile______: "Mobile Bookmarks",
  unfiled_____: "Other Bookmarks",
};

async function bootstrap(): Promise<void> {
  await populateTabDetails();
  await loadFolders();
  await discoverExistingBookmarks();
  renderResults(allFolders.slice(0, 25));
  wireEvents();
  // Focus the search input so users can immediately search for folders.
  searchInput.focus();
  removeButton.disabled = true; // Removal is not implemented yet, keep UI parity but disabled.
  updateSaveButtonState();
}

async function populateTabDetails(): Promise<void> {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab?.title) {
      nameInput.value = activeTab.title;
    }
    if (activeTab?.url) {
      activeTabUrl = activeTab.url;
    }
  } catch (error) {
    console.error("Failed to resolve active tab", error);
  }
}

async function loadFolders(): Promise<void> {
  try {
    const tree = await browser.bookmarks.getTree();
    for (const node of tree) {
      if (node.children) {
        collectFolders(node.children, []);
      }
    }
  } catch (error) {
    console.error("Failed to read bookmarks", error);
  }
}

function collectFolders(nodes: BookmarkTreeNode[], trail: string[]): void {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue;
    }

    const label = resolveFolderName(node);
    const nextTrail = [...trail, label];

    if (node.id !== "root________") {
      allFolders.push({
        id: node.id,
        name: label,
        path: nextTrail,
        pathLabel: nextTrail.join(" / "),
      });
    }

    if (node.children) {
      collectFolders(node.children, nextTrail);
    }
  }
}

function resolveFolderName(node: BookmarkTreeNode): string {
  if (node.title && node.title.trim().length > 0) {
    return node.title;
  }
  return ROOT_LABELS[node.id] ?? "Unnamed folder";
}

async function discoverExistingBookmarks(): Promise<void> {
  if (!activeTabUrl) {
    return;
  }

  try {
    const existing = await findExistingBookmarks(activeTabUrl);
    for (const bookmark of existing) {
      if (!bookmark.parentId) {
        continue;
      }
      existingBookmarkFolderIds.add(bookmark.parentId);
    }
  } catch (error) {
    console.error("Failed to detect existing bookmarks", error);
  }
}

async function findExistingBookmarks(url: string): Promise<BookmarkTreeNode[]> {
  try {
    // Let the bookmarks API decide whether the string qualifies as a "real" URL.
    // A local `new URL(url)` check would accept Firefox-internal pages (e.g. `about:addons`)
    // even though the structured search rejects them, so we intentionally rely on the API.
    return await browser.bookmarks.search({ url: url });
  } catch (error) {
    if (!isInvalidUrlQueryError(error)) {
      throw error;
    }
  }
  // The fallback only runs for those internal URLs. The string overload accepts them,
  // so we filter the broader results back down to an exact match to keep behaviour unchanged.
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

  if (!error || typeof error !== "object") {
    return false;
  }

  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes('.url must match the format "url"');
}

function wireEvents(): void {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const results = query ? filterFolders(query) : allFolders.slice(0, 50);
    renderResults(results);
    updateSaveButtonState();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    if (currentResults.length === 0) {
      return;
    }

    for (const folder of currentResults) {
      selectedFolderIds.add(folder.id);
    }

    renderResults(currentResults);
    searchInput.focus();
  });

  saveButton.addEventListener("click", async () => {
    await saveBookmarks();
  });
}

function filterFolders(query: string): FolderEntry[] {
  return allFolders
    .filter((folder) => folder.pathLabel.toLowerCase().includes(query))
    .slice(0, 100);
}

function renderResults(folders: FolderEntry[]): void {
  currentResults = folders;
  resultsList.innerHTML = "";
  if (folders.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No matching folders";
    resultsList.appendChild(empty);
    updateSaveButtonState();
    return;
  }

  for (const folder of folders) {
    const isExisting = existingBookmarkFolderIds.has(folder.id);
    const isSelected = selectedFolderIds.has(folder.id);

    const item = document.createElement("li");
    item.className = "folder-list__item";
    item.dataset.folderId = folder.id;
    if (isExisting) {
      item.classList.add("folder-list__item--existing");
    }
    if (isSelected && !isExisting) {
      item.classList.add("folder-list__item--selected");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isSelected;
    // Checkbox already flipped its checked state by the time the event fires;
    // just forward that value without re-reading our selection map.
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSelection(
        event.currentTarget as HTMLLIElement,
        folder.id,
        checkbox.checked
      );
    });

    const labelContainer = document.createElement("div");
    labelContainer.className = "folder-list__label";

    const nameSpan = document.createElement("div");
    nameSpan.className = "folder-list__name";
    nameSpan.textContent = folder.name;

    const nameRow = document.createElement("div");
    nameRow.className = "folder-list__name-row";
    nameRow.appendChild(nameSpan);

    if (isExisting) {
      const statusSpan = document.createElement("span");
      statusSpan.className = "folder-list__status";
      statusSpan.textContent = "Bookmark exists here";
      nameRow.appendChild(statusSpan);
    }

    const pathSpan = document.createElement("div");
    pathSpan.className = "folder-list__path";
    pathSpan.textContent = folder.path.slice(0, -1).join(" / ") || "Root";

    labelContainer.appendChild(nameRow);
    labelContainer.appendChild(pathSpan);

    item.appendChild(checkbox);
    item.appendChild(labelContainer);
    if (!isExisting) {
      // Row clicks happen before the checkbox toggles, so we derive the new state manually.
      item.addEventListener("click", (event) => {
        const isActive = selectedFolderIds.has(folder.id);
        toggleSelection(
          event.currentTarget as HTMLLIElement,
          folder.id,
          !isActive
        );
        checkbox.checked = !isActive;
      });
    } else {
      checkbox.checked = true;
    }

    resultsList.appendChild(item);
  }

  updateSaveButtonState();
}

function toggleSelection(
  listItem: HTMLLIElement,
  folderId: string,
  shouldSelect: boolean
): void {
  if (shouldSelect) {
    selectedFolderIds.add(folderId);
    listItem.classList.toggle("folder-list__item--selected");
  } else {
    selectedFolderIds.delete(folderId);
  }
}

async function saveBookmarks(): Promise<void> {
  if (selectedFolderIds.size === 0) {
    return;
  }

  saveButton.disabled = true;

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab?.url) {
      throw new Error("Active tab is missing URL");
    }

    const title = nameInput.value.trim() || activeTab.title || activeTab.url;
    const targetFolders = Array.from(selectedFolderIds);

    if (targetFolders.length === 0) {
      window.close();
      return;
    }

    await browser.runtime.sendMessage({
      type: "create-bookmarks",
      payload: {
        folders: targetFolders,
        title,
        url: activeTab.url,
      },
    });

    for (const folderId of targetFolders) {
      existingBookmarkFolderIds.add(folderId);
    }

    window.close();
  } catch (error) {
    console.error("Failed to save bookmarks", error);
  } finally {
    saveButton.disabled = selectedFolderIds.size === 0;
  }
}

function updateSaveButtonState(): void {
  saveButton.disabled = selectedFolderIds.size === 0;
}

bootstrap().catch((error) => {
  console.error("Failed to initialise popup", error);
});
