/// <reference types="firefox-webext-browser" />

type BookmarkTreeNode = browser.bookmarks.BookmarkTreeNode;

type FolderEntry = {
  id: string;
  name: string;
  path: string[];
  pathLabel: string;
};

const nameInput = document.getElementById('bookmark-name') as HTMLInputElement;
const searchInput = document.getElementById('folder-search') as HTMLInputElement;
const resultsList = document.getElementById('folder-results') as HTMLUListElement;
const saveButton = document.getElementById('save-bookmark') as HTMLButtonElement;
const removeButton = document.getElementById('remove-bookmark') as HTMLButtonElement;

// Flat lookup table instead of repeatedly traversing the bookmark tree during search.
const allFolders: FolderEntry[] = [];
// Track selections across re-renders so the UI behaves like a multi-select list.
const selectedFolderIds = new Set<string>();

// Provide friendly labels for root containers that report empty titles in the API.
const ROOT_LABELS: Record<string, string> = {
  'root________': 'Root',
  'toolbar_____': 'Bookmarks Toolbar',
  'menu________': 'Bookmarks Menu',
  'mobile______': 'Mobile Bookmarks',
  'unfiled_____': 'Other Bookmarks',
};

async function bootstrap(): Promise<void> {
  await populateTabDetails();
  await loadFolders();
  renderResults(allFolders.slice(0, 25));
  wireEvents();
  removeButton.disabled = true; // Removal is not implemented yet, keep UI parity but disabled.
  updateSaveButtonState(true);
}

async function populateTabDetails(): Promise<void> {
  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.title) {
      nameInput.value = activeTab.title;
    }
  } catch (error) {
    console.error('Failed to resolve active tab', error);
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
    console.error('Failed to read bookmarks', error);
  }
}

function collectFolders(nodes: BookmarkTreeNode[], trail: string[]): void {
  for (const node of nodes) {
    if (node.type !== 'folder') {
      continue;
    }

    const label = resolveFolderName(node);
    const nextTrail = [...trail, label];

    if (node.id !== 'root________') {
      allFolders.push({
        id: node.id,
        name: label,
        path: nextTrail,
        pathLabel: nextTrail.join(' / '),
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
  return ROOT_LABELS[node.id] ?? 'Unnamed folder';
}

function wireEvents(): void {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const results = query ? filterFolders(query) : allFolders.slice(0, 50);
    renderResults(results);
    updateSaveButtonState(true);
  });

  saveButton.addEventListener('click', async () => {
    await saveBookmarks();
  });
}

function filterFolders(query: string): FolderEntry[] {
  return allFolders
    .filter((folder) => folder.pathLabel.toLowerCase().includes(query))
    .slice(0, 100);
}

function renderResults(folders: FolderEntry[]): void {
  resultsList.innerHTML = '';
  if (folders.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No matching folders';
    resultsList.appendChild(empty);
    updateSaveButtonState(false);
    return;
  }

  for (const folder of folders) {
    const item = document.createElement('li');
    item.className = 'folder-list__item';
    item.dataset.folderId = folder.id;
    if (selectedFolderIds.has(folder.id)) {
      item.classList.add('folder-list__item--selected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedFolderIds.has(folder.id);
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSelection(folder.id, checkbox.checked);
    });

    const labelContainer = document.createElement('div');
    labelContainer.className = 'folder-list__label';

    const nameSpan = document.createElement('div');
    nameSpan.textContent = folder.name;

    const pathSpan = document.createElement('div');
    pathSpan.className = 'folder-list__path';
    pathSpan.textContent = folder.path.slice(0, -1).join(' / ') || 'Root';

    labelContainer.appendChild(nameSpan);
    labelContainer.appendChild(pathSpan);

    item.appendChild(checkbox);
    item.appendChild(labelContainer);
    item.addEventListener('click', () => {
      const isActive = selectedFolderIds.has(folder.id);
      toggleSelection(folder.id, !isActive);
      checkbox.checked = !isActive;
    });

    resultsList.appendChild(item);
  }

  updateSaveButtonState(false);
}

function toggleSelection(folderId: string, shouldSelect: boolean): void {
  if (shouldSelect) {
    selectedFolderIds.add(folderId);
  } else {
    selectedFolderIds.delete(folderId);
  }
  const query = searchInput.value.trim().toLowerCase();
  const foldersToRender = query ? filterFolders(query) : allFolders.slice(0, 50);
  renderResults(foldersToRender);
  updateSaveButtonState(true);
}

async function saveBookmarks(): Promise<void> {
  if (selectedFolderIds.size === 0) {
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';

  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.url) {
      throw new Error('Active tab is missing URL');
    }

    const title = nameInput.value.trim() || activeTab.title || activeTab.url;
    const targetFolders = Array.from(selectedFolderIds);

    // Creating bookmarks in parallel keeps the popup responsive for multi-select saves.
    await Promise.all(
      targetFolders.map((folderId) =>
        browser.bookmarks.create({ parentId: folderId, title, url: activeTab.url })
      )
    );

    saveButton.textContent = 'Saved';
    window.setTimeout(() => window.close(), 400);
  } catch (error) {
    console.error('Failed to save bookmarks', error);
    saveButton.textContent = 'Retry';
  } finally {
    updateSaveButtonState(false);
  }
}

function updateSaveButtonState(resetText: boolean): void {
  const shouldDisable = selectedFolderIds.size === 0;
  saveButton.disabled = shouldDisable;
  if (resetText && !shouldDisable) {
    saveButton.textContent = 'Save';
  }
}

bootstrap().catch((error) => {
  console.error('Failed to initialise popup', error);
});
