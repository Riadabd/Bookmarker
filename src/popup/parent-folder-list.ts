import { createFolderListCore } from "./folder-list-core.js";
import { formatFolderPath } from "./folder-index.js";
import type { FolderEntry } from "./types.js";

type ParentFolderListState = {
  selectedId: string | null;
};

type ParentFolderRow = {
  element: HTMLLIElement;
  radio: HTMLInputElement;
  name: HTMLDivElement;
  path: HTMLDivElement;
};

export type ParentFolderList = {
  render: (folders: FolderEntry[], state: ParentFolderListState) => void;
  clear: () => void;
};

type CreateParentFolderListOptions = {
  listElement: HTMLUListElement;
  onSelect: (folderId: string) => void;
};

export function createParentFolderList(
  options: CreateParentFolderListOptions
): ParentFolderList {
  const { listElement, onSelect } = options;

  let renderState: ParentFolderListState = {
    selectedId: null,
  };

  const core = createFolderListCore<ParentFolderRow, ParentFolderListState>({
    listElement,
    emptyStateText: "No parent matches",
    buildRow(folder) {
      const item = document.createElement("li");
      item.className = "folder-list__item";
      item.dataset.folderId = folder.id;

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "create-folder-parent";
      radio.addEventListener("click", (event: MouseEvent) => {
        event.stopPropagation();
        onSelect(folder.id);
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

      item.addEventListener("click", () => {
        onSelect(folder.id);
      });

      return {
        element: item,
        radio,
        name: nameSpan,
        path: pathSpan,
      };
    },
    updateRow(row, folder, state) {
      const isSelected = state.selectedId === folder.id;

      row.element.dataset.folderId = folder.id;
      row.element.classList.toggle("folder-list__item--selected", isSelected);
      row.radio.checked = isSelected;

      if (row.name.textContent !== folder.name) {
        row.name.textContent = folder.name;
      }

      const nextPath = formatFolderPath(folder);
      if (row.path.textContent !== nextPath) {
        row.path.textContent = nextPath;
      }
    },
  });

  return {
    render(folders, state) {
      renderState = { selectedId: state.selectedId };
      core.render(folders, renderState);
    },
    clear: core.clear,
  };
}
