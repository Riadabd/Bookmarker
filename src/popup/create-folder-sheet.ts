import type { BookmarkService } from "./bookmark-service.js";
import type { PopupElements } from "./dom.js";
import { getDefaultFolders, searchFolders } from "./folder-index.js";
import { createParentFolderList } from "./parent-folder-list.js";
import type {
  CreatedFolderNotification,
  FolderEntry,
  FolderIndex,
} from "./types.js";

export type CreateFolderSheet = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

type CreateFolderSheetOptions = {
  elements: PopupElements["createFolderSheet"];
  returnFocusElement: HTMLInputElement;
  service: Pick<BookmarkService, "createFolder">;
  getFolderIndex: () => FolderIndex;
  onFolderCreated: (notification: CreatedFolderNotification) => void;
};

export function createCreateFolderSheet(
  options: CreateFolderSheetOptions
): CreateFolderSheet {
  const {
    elements,
    returnFocusElement,
    service,
    getFolderIndex,
    onFolderCreated,
  } = options;
  const {
    trigger,
    sheet,
    form,
    nameInput,
    parentSearchInput,
    parentClearButton,
    parentResultsList,
    cancelButton,
    submitButton,
  } = elements;

  let currentResults: FolderEntry[] = [];
  let selectedParentId: string | null = null;

  const parentFolderList = createParentFolderList({
    listElement: parentResultsList,
    onSelect: setSelectedParent,
  });

  trigger.setAttribute("aria-expanded", "false");

  trigger.addEventListener("click", () => {
    if (sheet.hidden) {
      open();
      return;
    }

    close();
    returnFocusElement.focus();
  });

  cancelButton.addEventListener("click", () => {
    close();
    returnFocusElement.focus();
  });

  parentSearchInput.addEventListener("input", () => {
    const index = getFolderIndex();
    const query = parentSearchInput.value;
    const results = query
      ? searchFolders(index, query, 50)
      : getDefaultFolders(index, 50);

    renderParentResults(results);
    updateParentClearButtonState();
  });

  parentSearchInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const [first] = currentResults;
    if (first) {
      setSelectedParent(first.id);
    }
  });

  parentClearButton.addEventListener("click", () => {
    if (!parentSearchInput.value) {
      parentSearchInput.focus();
      return;
    }

    parentSearchInput.value = "";
    renderParentResults(getDefaultFolders(getFolderIndex(), 50));
    updateParentClearButtonState();
    parentSearchInput.focus();
  });

  form.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    await handleSubmit();
  });

  function open(): void {
    selectedParentId = null;
    nameInput.value = "";
    parentSearchInput.value = "";
    sheet.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    renderParentResults(getDefaultFolders(getFolderIndex(), 50));
    updateParentClearButtonState();
    updateSubmitState();

    window.requestAnimationFrame(() => {
      nameInput.focus();
    });
  }

  function close(): void {
    sheet.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    form.reset();
    selectedParentId = null;
    currentResults = [];
    parentFolderList.clear();
    updateParentClearButtonState();
    submitButton.disabled = false;
  }

  function isOpen(): boolean {
    return !sheet.hidden;
  }

  function setSelectedParent(folderId: string): void {
    if (!getFolderIndex().folderLookup.has(folderId)) {
      return;
    }

    if (selectedParentId === folderId) {
      return;
    }

    selectedParentId = folderId;
    parentFolderList.render(currentResults, { selectedId: selectedParentId });
    updateSubmitState();
  }

  function renderParentResults(folders: FolderEntry[]): void {
    currentResults = folders.slice(0, 50);
    parentFolderList.render(currentResults, { selectedId: selectedParentId });
  }

  function updateParentClearButtonState(): void {
    parentClearButton.hidden = parentSearchInput.value.length === 0;
  }

  function updateSubmitState(): void {
    submitButton.disabled = !selectedParentId;
  }

  async function handleSubmit(): Promise<void> {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    const parentId = selectedParentId;
    if (!parentId) {
      console.error("Missing parent folder for new folder creation");
      parentSearchInput.focus();
      return;
    }

    submitButton.disabled = true;

    try {
      const folder = await service.createFolder(parentId, name);
      onFolderCreated({
        parentId,
        folder,
        requestedTitle: name,
      });
      close();
      returnFocusElement.focus();
    } catch (error: unknown) {
      console.error("Failed to create folder", error);
    } finally {
      if (!sheet.hidden) {
        updateSubmitState();
      }
    }
  }

  return {
    open,
    close,
    isOpen,
  };
}
