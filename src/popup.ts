/// <reference types="firefox-webext-browser" />

type BookmarkTreeNode = browser.bookmarks.BookmarkTreeNode;

type FolderEntry = {
  id: string;
  name: string;
  path: string[];
  searchKey: string;
};

type ElementConstructor<T extends HTMLElement> = {
  new (): T;
};

function getRequiredElement<T extends HTMLElement>(
  id: string,
  expectedType: ElementConstructor<T>
): T {
  const element: HTMLElement | null = document.getElementById(id);
  if (!(element instanceof expectedType)) {
    throw new Error(`Expected ${expectedType.name} for #${id}`);
  }

  return element;
}

const nameInput: HTMLInputElement = getRequiredElement(
  "bookmark-name",
  HTMLInputElement
);
const searchInput: HTMLInputElement = getRequiredElement(
  "folder-search",
  HTMLInputElement
);
const searchClearButton: HTMLButtonElement = getRequiredElement(
  "folder-search-clear",
  HTMLButtonElement
);
const resultsList: HTMLUListElement = getRequiredElement(
  "folder-results",
  HTMLUListElement
);
const saveButton: HTMLButtonElement = getRequiredElement(
  "save-bookmark",
  HTMLButtonElement
);
const saveError: HTMLParagraphElement = getRequiredElement(
  "save-error",
  HTMLParagraphElement
);
const removeButton: HTMLButtonElement = getRequiredElement(
  "remove-bookmark",
  HTMLButtonElement
);
// Elements powering the inline create-folder sheet, kept alongside the primary picker nodes.
const createFolderTrigger: HTMLButtonElement = getRequiredElement(
  "create-folder-trigger",
  HTMLButtonElement
);
const createFolderSheet: HTMLDivElement = getRequiredElement(
  "create-folder-sheet",
  HTMLDivElement
);
const createFolderForm: HTMLFormElement = getRequiredElement(
  "create-folder-form",
  HTMLFormElement
);
const createFolderNameInput: HTMLInputElement = getRequiredElement(
  "create-folder-name",
  HTMLInputElement
);
const createFolderParentSearch: HTMLInputElement = getRequiredElement(
  "create-folder-parent-search",
  HTMLInputElement
);
const createFolderParentClear: HTMLButtonElement = getRequiredElement(
  "create-folder-parent-clear",
  HTMLButtonElement
);
const createFolderParentResults: HTMLUListElement = getRequiredElement(
  "create-folder-parent-results",
  HTMLUListElement
);
const createFolderCancelButton: HTMLButtonElement = getRequiredElement(
  "create-folder-cancel",
  HTMLButtonElement
);
const createFolderSubmitButton: HTMLButtonElement = getRequiredElement(
  "create-folder-submit",
  HTMLButtonElement
);

// Flat lookup table instead of repeatedly traversing the bookmark tree during search.
const allFolders: FolderEntry[] = [];
const folderLookup = new Map<string, FolderEntry>();
// Track selections across re-renders so the UI behaves like a multi-select list.
const selectedFolderIds = new Set<string>();
// Track folders that already contain a bookmark for the active tab.
const existingBookmarkFolderIds = new Set<string>();
// Cache currently rendered folders so keyboard shortcuts can act on the visible list.
let currentResults: FolderEntry[] = [];
// Maintain a lightweight cache for the parent picker list so we can re-render without re-filtering.
let parentResults: FolderEntry[] = [];
// Capture the active tab url so we can detect existing bookmarks.
let activeTabUrl: string | undefined;
// Cache the mapping between folderId and DOM element to avoid always re-rendering the
// entire list on input changes.
type RowElements = {
  element: HTMLLIElement;
  checkbox: HTMLInputElement;
  name: HTMLDivElement;
  path: HTMLDivElement;
  status: HTMLSpanElement;
};

type SaveFailureReconciliation = {
  refreshed: boolean;
  remainingCount: number;
  succeededCount: number;
};

let rowByFolderId: Map<string, RowElements> = new Map<string, RowElements>();
let pendingRender: FolderEntry[] | null = null;
let renderScheduled = false;
// Remember which parent folder is currently chosen in the create-folder sheet.
let selectedParentId: string | null = null;

// Provide friendly labels for root containers that report empty titles in the API.
const ROOT_LABELS: Record<string, string> = {
  root________: "Root",
  toolbar_____: "Bookmarks Toolbar",
  menu________: "Bookmarks Menu",
  mobile______: "Mobile Bookmarks",
  unfiled_____: "Other Bookmarks",
};

function isPopupRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBookmarkTreeNode(value: unknown): value is BookmarkTreeNode {
  return isPopupRecord(value) && typeof value.id === "string";
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

function clearSaveError(): void {
  saveError.hidden = true;
  saveError.textContent = "";
}

function showSaveError(message: string): void {
  saveError.textContent = message;
  saveError.hidden = false;
}

async function reconcileSaveFailure(
  url: string,
  attemptedFolderIds: string[]
): Promise<SaveFailureReconciliation> {
  try {
    // A failed multi-folder save may still have created some bookmarks, so re-read the tree first.
    await refreshExistingBookmarkFolderIds(url);

    // Rebuild the retry selection from only the folders that still need the bookmark.
    selectedFolderIds.clear();
    for (const folderId of attemptedFolderIds) {
      if (existingBookmarkFolderIds.has(folderId)) {
        continue;
      }
      selectedFolderIds.add(folderId);
    }

    renderResults(currentResults);

    return {
      refreshed: true,
      remainingCount: selectedFolderIds.size,
      succeededCount: attemptedFolderIds.length - selectedFolderIds.size,
    };
  } catch (refreshError: unknown) {
    console.error("Failed to refresh bookmark state after save failure", refreshError);

    return {
      refreshed: false,
      remainingCount: attemptedFolderIds.length,
      succeededCount: 0,
    };
  }
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
  updateSearchClearButtonState();
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
      const entry: FolderEntry = {
        id: node.id,
        name: label,
        path: nextTrail,
        searchKey: label.toLowerCase(),
      };
      allFolders.push(entry);
      folderLookup.set(node.id, entry);
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
    await refreshExistingBookmarkFolderIds(activeTabUrl);
  } catch (error: unknown) {
    console.error("Failed to detect existing bookmarks", error);
  }
}

async function refreshExistingBookmarkFolderIds(url: string): Promise<void> {
  const existing = await findExistingBookmarks(url);
  const nextExistingFolderIds = new Set<string>();

  for (const bookmark of existing) {
    if (!bookmark.parentId) {
      continue;
    }
    nextExistingFolderIds.add(bookmark.parentId);
  }

  // Replace the full set so initial load and retry reconciliation use the same source of truth.
  existingBookmarkFolderIds.clear();
  for (const folderId of nextExistingFolderIds) {
    existingBookmarkFolderIds.add(folderId);
  }
}

async function findExistingBookmarks(url: string): Promise<BookmarkTreeNode[]> {
  try {
    // Let the bookmarks API decide whether the string qualifies as a "real" URL.
    // A local `new URL(url)` check would accept Firefox-internal pages (e.g. `about:addons`)
    // even though the structured search rejects them, so we intentionally rely on the API.
    return await browser.bookmarks.search({ url: url });
  } catch (error: unknown) {
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

  if (!isPopupRecord(error) || !("message" in error)) {
    return false;
  }

  const message = String(error.message ?? "");
  return message.includes('.url must match the format "url"');
}

function wireEvents(): void {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const results = query ? filterFolders(query) : allFolders.slice(0, 50);
    renderResults(results);
    updateSearchClearButtonState();
  });

  searchInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    if (currentResults.length === 0) {
      return;
    }

    for (const folder of currentResults) {
      if (existingBookmarkFolderIds.has(folder.id)) {
        continue;
      }
      selectedFolderIds.add(folder.id);
    }

    searchInput.value = "";
    searchInput.focus();
    renderResults(allFolders.slice(0, 50));
    updateSearchClearButtonState();
  });

  searchClearButton.addEventListener("click", () => {
    if (!searchInput.value) {
      searchInput.focus();
      return;
    }
    searchInput.value = "";
    renderResults(allFolders.slice(0, 50));
    updateSearchClearButtonState();
    searchInput.focus();
  });

  saveButton.addEventListener("click", async () => {
    await saveBookmarks();
  });

  createFolderTrigger.setAttribute("aria-expanded", "false");

  // Toggle the sheet open/closed without leaving the popup context.
  createFolderTrigger.addEventListener("click", () => {
    if (createFolderSheet.hidden) {
      openCreateFolderSheet();
    } else {
      closeCreateFolderSheet();
      searchInput.focus();
    }
  });

  createFolderCancelButton.addEventListener("click", () => {
    closeCreateFolderSheet();
    searchInput.focus();
  });

  // Keep the parent picker results in sync with the free-text filter.
  createFolderParentSearch.addEventListener("input", () => {
    const query = createFolderParentSearch.value.trim().toLowerCase();
    const results = query
      ? filterFolders(query)
      : allFolders.slice(0, 50);
    renderParentResults(results.slice(0, 50));
    updateParentClearButtonState();
  });

  // Allow pressing Enter to accept the first visible parent result without leaving the field.
  createFolderParentSearch.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (parentResults.length === 0) {
      return;
    }
    const [first] = parentResults;
    if (first) {
      setSelectedParent(first.id);
    }
  });

  // Mirror the main search clear affordance for the parent picker.
  createFolderParentClear.addEventListener("click", () => {
    if (!createFolderParentSearch.value) {
      createFolderParentSearch.focus();
      return;
    }
    createFolderParentSearch.value = "";
    renderParentResults(allFolders.slice(0, 50));
    updateParentClearButtonState();
    createFolderParentSearch.focus();
  });

  // Submit the inline form to spawn the folder via the background script.
  createFolderForm.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    await handleCreateFolderSubmit();
  });
}

function filterFolders(query: string): FolderEntry[] {
  return allFolders
    .filter((folder) => folder.searchKey.includes(query))
    .slice(0, 100);
}

function formatFolderPath(folder: FolderEntry): string {
  return folder.path.slice(0, -1).join(" / ") || "Root";
}

function buildRow(folder: FolderEntry): RowElements {
  const item = document.createElement("li");
  item.className = "folder-list__item";
  item.dataset.folderId = folder.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.addEventListener("click", (event: MouseEvent) => {
    event.stopPropagation();
    const folderId = item.dataset.folderId!;
    if (existingBookmarkFolderIds.has(folderId)) {
      event.preventDefault();
      return;
    }
    toggleSelection(item, folderId, checkbox.checked);
  });

  const labelContainer = document.createElement("div");
  labelContainer.className = "folder-list__label";

  const nameRow = document.createElement("div");
  nameRow.className = "folder-list__name-row";

  const nameSpan = document.createElement("div");
  nameSpan.className = "folder-list__name";
  nameSpan.textContent = folder.name;

  const statusSpan = document.createElement("span");
  statusSpan.className = "folder-list__status";
  statusSpan.textContent = "Bookmark exists here";
  statusSpan.hidden = true;

  nameRow.appendChild(nameSpan);
  nameRow.appendChild(statusSpan);

  const pathSpan = document.createElement("div");
  pathSpan.className = "folder-list__path";
  pathSpan.textContent = formatFolderPath(folder);

  labelContainer.appendChild(nameRow);
  labelContainer.appendChild(pathSpan);

  item.appendChild(checkbox);
  item.appendChild(labelContainer);

  item.addEventListener("click", () => {
    const folderId = item.dataset.folderId!;
    if (existingBookmarkFolderIds.has(folderId)) {
      return;
    }
    const isActive = selectedFolderIds.has(folderId);
    toggleSelection(item, folderId, !isActive);
    checkbox.checked = !isActive;
  });

  return {
    element: item,
    checkbox,
    name: nameSpan,
    path: pathSpan,
    status: statusSpan,
  };
}

function renderResults(folders: FolderEntry[]): void {
  // Coalesce rapid updates and let the browser flush once per frame.
  currentResults = folders;
  pendingRender = folders;
  if (renderScheduled) {
    return;
  }

  renderScheduled = true;
  window.requestAnimationFrame(() => {
    renderScheduled = false;
    const next = pendingRender;
    pendingRender = null;
    if (!next) {
      return;
    }
    commitRender(next);
  });
}

function commitRender(folders: FolderEntry[]): void {
  const newFolderIdSet: Set<string> = new Set(
    folders.map((folder) => folder.id)
  );

  if (folders.length === 0) {
    resultsList.innerHTML = "";
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No matching folders";
    resultsList.appendChild(empty);
    updateSaveButtonState();
    return;
  }

  const emptyState = resultsList.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }

  // Delete rows no longer in current result
  for (const child of Array.from(resultsList.children)) {
    if (!(child instanceof HTMLLIElement)) {
      continue;
    }

    const existingFolderId = child.dataset.folderId;
    if (!existingFolderId || !newFolderIdSet.has(existingFolderId)) {
      child.remove();
    }
  }

  const elements: HTMLLIElement[] = [];

  for (const folder of folders) {
    const isExisting = existingBookmarkFolderIds.has(folder.id);
    const isSelected = selectedFolderIds.has(folder.id);

    let row: RowElements;
    if (rowByFolderId.has(folder.id)) {
      row = rowByFolderId.get(folder.id)!;
    } else {
      row = buildRow(folder);
      rowByFolderId.set(folder.id, row);
    }

    const { element, checkbox, status, name, path } = row;

    element.dataset.folderId = folder.id;
    element.classList.toggle("folder-list__item--existing", isExisting);
    element.classList.toggle(
      "folder-list__item--selected",
      isSelected && !isExisting
    );

    checkbox.disabled = isExisting;

    if (isExisting) {
      checkbox.checked = true;
    } else {
      checkbox.checked = isSelected;
    }

    status.hidden = !isExisting;

    if (name.textContent !== folder.name) {
      name.textContent = folder.name;
    }

    const nextPath = formatFolderPath(folder);
    if (path.textContent !== nextPath) {
      path.textContent = nextPath;
    }

    elements.push(element);
  }

  resultsList.append(...elements);

  updateSaveButtonState();
}

function openCreateFolderSheet(): void {
  selectedParentId = null;

  const initialResults = allFolders.slice(0, 50);

  createFolderNameInput.value = "";
  createFolderParentSearch.value = "";
  createFolderSheet.hidden = false;
  createFolderTrigger.setAttribute("aria-expanded", "true");
  // Pre-populate the parent picker with the same default slice used in the main list.
  renderParentResults(initialResults);
  updateParentClearButtonState();
  updateCreateFolderSubmitState();

  window.requestAnimationFrame(() => {
    createFolderNameInput.focus();
  });
}

function closeCreateFolderSheet(): void {
  // Collapse the sheet and clear all transient state so the next open starts fresh.
  createFolderSheet.hidden = true;
  createFolderTrigger.setAttribute("aria-expanded", "false");
  createFolderForm.reset();
  selectedParentId = null;
  parentResults = [];
  createFolderParentResults.innerHTML = "";
  updateParentClearButtonState();
  createFolderSubmitButton.disabled = false;
}

function renderParentResults(folders: FolderEntry[]): void {
  const limited = folders.slice(0, 50);
  parentResults = limited;

  createFolderParentResults.innerHTML = "";

  if (limited.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No parent matches";
    createFolderParentResults.appendChild(empty);
    return;
  }

  for (const folder of limited) {
    const row = buildParentRow(folder);
    createFolderParentResults.appendChild(row);
  }
}

function buildParentRow(folder: FolderEntry): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "folder-list__item";
  item.dataset.folderId = folder.id;

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "create-folder-parent";
  radio.checked = folder.id === selectedParentId;
  // Keep the radio change local so the list item click handler can still toggle selection.
  radio.addEventListener("click", (event: MouseEvent) => {
    event.stopPropagation();
    setSelectedParent(folder.id);
  });

  const labelContainer = document.createElement("div");
  labelContainer.className = "folder-list__label";

  const nameRow = document.createElement("div");
  nameRow.className = "folder-list__name-row";

  const nameSpan = document.createElement("div");
  nameSpan.className = "folder-list__name";
  nameSpan.textContent = folder.name;

  const pathSpan = document.createElement("div");
  pathSpan.className = "folder-list__path";
  pathSpan.textContent = formatFolderPath(folder);

  nameRow.appendChild(nameSpan);
  labelContainer.appendChild(nameRow);
  labelContainer.appendChild(pathSpan);

  item.appendChild(radio);
  item.appendChild(labelContainer);

  if (folder.id === selectedParentId) {
    item.classList.add("folder-list__item--selected");
  }

  // Clicking anywhere on the row mirrors the native dialog by selecting the radio option.
  item.addEventListener("click", () => {
    setSelectedParent(folder.id);
  });

  return item;
}

function setSelectedParent(folderId: string): void {
  if (selectedParentId === folderId) {
    return;
  }
  selectedParentId = folderId;
  if (!folderLookup.has(folderId)) {
    return;
  }
  renderParentResults(parentResults);
  updateCreateFolderSubmitState();
}

function updateParentClearButtonState(): void {
  // Show the clear icon only when there is text to clear.
  createFolderParentClear.hidden = createFolderParentSearch.value.length === 0;
}

function updateCreateFolderSubmitState(): void {
  // Users must explicitly pick a parent; without one, the create call would fail.
  createFolderSubmitButton.disabled = !selectedParentId;
}

async function handleCreateFolderSubmit(): Promise<void> {
  const name = createFolderNameInput.value.trim();
  if (!name) {
    createFolderNameInput.focus();
    return;
  }

  const parentId = selectedParentId;
  if (!parentId) {
    console.error("Missing parent folder for new folder creation");
    createFolderParentSearch.focus();
    return;
  }

  createFolderSubmitButton.disabled = true;

  try {
    const createdMessage: unknown = await browser.runtime.sendMessage({
      type: "create-folder",
      payload: {
        parentId,
        title: name,
      },
    });

    if (!isBookmarkTreeNode(createdMessage)) {
      throw new Error("Background did not return created folder");
    }

    const created: BookmarkTreeNode = createdMessage;
    const createdName = created.title?.trim() || name;
    const parentEntry = folderLookup.get(parentId);
    const parentPath = parentEntry ? [...parentEntry.path] : [];

    const newEntry: FolderEntry = {
      id: created.id,
      name: createdName,
      path: [...parentPath, createdName],
      searchKey: createdName.toLowerCase(),
    };

    const parentIndex = parentEntry
      ? allFolders.findIndex((entry) => entry.id === parentEntry.id)
      : -1;
    if (parentIndex >= 0) {
      // Insert immediately after the parent to keep the flat list roughly grouped together.
      allFolders.splice(parentIndex + 1, 0, newEntry);
    } else {
      // As a fallback, surface the new folder near the top so it is immediately discoverable.
      allFolders.unshift(newEntry);
    }
    folderLookup.set(newEntry.id, newEntry);

    selectedFolderIds.add(newEntry.id);

    // Merge the freshly created folder into the current render so the user can confirm the save.
    const refreshedResults = [
      newEntry,
      ...currentResults.filter((folder) => folder.id !== newEntry.id),
    ].slice(0, 50);

    renderResults(refreshedResults);

    closeCreateFolderSheet();
    searchInput.value = "";
    updateSearchClearButtonState();
    updateSaveButtonState();
    searchInput.focus();
  } catch (error: unknown) {
    console.error("Failed to create folder", error);
  } finally {
    createFolderSubmitButton.disabled = false;
  }
}

function toggleSelection(
  listItem: HTMLLIElement,
  folderId: string,
  shouldSelect: boolean
): void {
  if (shouldSelect) {
    selectedFolderIds.add(folderId);
    listItem.classList.add("folder-list__item--selected");
  } else {
    selectedFolderIds.delete(folderId);
    listItem.classList.remove("folder-list__item--selected");
  }

  updateSaveButtonState();
}

async function saveBookmarks(): Promise<void> {
  if (selectedFolderIds.size === 0) {
    return;
  }

  clearSaveError();
  saveButton.disabled = true;
  let activeTabBookmarkUrl: string | undefined;
  let attemptedFolderIds: string[] = [];

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab?.url) {
      throw new Error("Active tab is missing URL");
    }
    activeTabBookmarkUrl = activeTab.url;

    const title = nameInput.value.trim() || activeTab.title || activeTab.url;
    const targetFolders = Array.from(selectedFolderIds);
    attemptedFolderIds = targetFolders;

    if (targetFolders.length === 0) {
      window.close();
      return;
    }

    // Keep the popup open until every requested write resolves so failures can still surface here.
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
  } catch (error: unknown) {
    console.error("Failed to save bookmarks", error);
    // Reconcile against the live bookmark tree before deciding what the user should retry.
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
    saveButton.disabled = selectedFolderIds.size === 0;
  }
}

function updateSaveButtonState(): void {
  saveButton.disabled = selectedFolderIds.size === 0;
}

function updateSearchClearButtonState(): void {
  searchClearButton.hidden = searchInput.value.length === 0;
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to initialise popup", error);
});
