import type { FolderEntry } from "./types.js";

type FolderListRowHandle = {
  element: HTMLLIElement;
};

type FolderListCoreOptions<
  RowHandle extends FolderListRowHandle,
  RenderState,
> = {
  listElement: HTMLUListElement;
  emptyStateText: string;
  buildRow: (folder: FolderEntry) => RowHandle;
  updateRow: (row: RowHandle, folder: FolderEntry, state: RenderState) => void;
};

export type FolderListCore<RowHandle, RenderState> = {
  render: (folders: FolderEntry[], state: RenderState) => void;
  clear: () => void;
};

export function createFolderListCore<
  RowHandle extends FolderListRowHandle,
  RenderState,
>(
  options: FolderListCoreOptions<RowHandle, RenderState>
): FolderListCore<RowHandle, RenderState> {
  const { listElement, emptyStateText, buildRow, updateRow } = options;
  const rowByFolderId = new Map<string, RowHandle>();

  let pendingRender:
    | {
        folders: FolderEntry[];
        state: RenderState;
      }
    | null = null;
  let renderScheduled = false;

  function render(folders: FolderEntry[], state: RenderState): void {
    pendingRender = { folders, state };
    if (renderScheduled) {
      return;
    }

    renderScheduled = true;
    window.requestAnimationFrame(() => {
      renderScheduled = false;
      const nextRender = pendingRender;
      pendingRender = null;
      if (!nextRender) {
        return;
      }

      commitRender(nextRender.folders, nextRender.state);
    });
  }

  function clear(): void {
    pendingRender = null;
    listElement.innerHTML = "";
  }

  function commitRender(folders: FolderEntry[], state: RenderState): void {
    const visibleFolderIds = new Set(folders.map((folder) => folder.id));

    if (folders.length === 0) {
      listElement.innerHTML = "";

      const emptyState = document.createElement("li");
      emptyState.className = "empty-state";
      emptyState.textContent = emptyStateText;
      listElement.appendChild(emptyState);
      return;
    }

    const existingEmptyState = listElement.querySelector(".empty-state");
    if (existingEmptyState) {
      existingEmptyState.remove();
    }

    for (const child of Array.from(listElement.children)) {
      if (!(child instanceof HTMLLIElement)) {
        continue;
      }

      const folderId = child.dataset.folderId;
      if (!folderId || !visibleFolderIds.has(folderId)) {
        child.remove();
      }
    }

    const orderedElements: HTMLLIElement[] = [];

    for (const folder of folders) {
      let row = rowByFolderId.get(folder.id);
      if (!row) {
        row = buildRow(folder);
        rowByFolderId.set(folder.id, row);
      }

      updateRow(row, folder, state);
      orderedElements.push(row.element);
    }

    listElement.append(...orderedElements);
  }

  return {
    render,
    clear,
  };
}
