import { createFolderListCore } from "./folder-list-core.js";
import { formatFolderPath } from "./folder-index.js";
import type { FolderEntry } from "./types.js";

type MainFolderListState = {
  selectedIds: ReadonlySet<string>;
  existingIds: ReadonlySet<string>;
};

type MainFolderRow = {
  element: HTMLLIElement;
  checkbox: HTMLInputElement;
  name: HTMLSpanElement;
  path: HTMLSpanElement;
  status: HTMLSpanElement;
};

export type MainFolderList = {
  render: (folders: FolderEntry[], state: MainFolderListState) => void;
  clear: () => void;
};

type CreateMainFolderListOptions = {
  listElement: HTMLUListElement;
  onToggle: (folderId: string, shouldSelect: boolean) => void;
};

export function createMainFolderList(
  options: CreateMainFolderListOptions
): MainFolderList {
  const { listElement, onToggle } = options;

  const core = createFolderListCore<MainFolderRow, MainFolderListState>({
    listElement,
    emptyStateText: "No matching folders",
    buildRow(folder) {
      const item = document.createElement("li");
      item.className = "folder-list__item";
      item.dataset.folderId = folder.id;

      const control = document.createElement("label");
      control.className = "folder-list__control";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", () => {
        onToggle(folder.id, checkbox.checked);
      });

      const labelContainer = document.createElement("span");
      labelContainer.className = "folder-list__label";

      const nameRow = document.createElement("span");
      nameRow.className = "folder-list__name-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "folder-list__name";
      nameSpan.textContent = folder.name;

      const statusSpan = document.createElement("span");
      statusSpan.className = "folder-list__status";
      statusSpan.textContent = "Bookmark exists here";
      statusSpan.hidden = true;

      nameRow.appendChild(nameSpan);
      nameRow.appendChild(statusSpan);

      const pathSpan = document.createElement("span");
      pathSpan.className = "folder-list__path";
      pathSpan.textContent = formatFolderPath(folder);

      labelContainer.appendChild(nameRow);
      labelContainer.appendChild(pathSpan);

      control.appendChild(checkbox);
      control.appendChild(labelContainer);
      item.appendChild(control);

      return {
        element: item,
        checkbox,
        name: nameSpan,
        path: pathSpan,
        status: statusSpan,
      };
    },
    updateRow(row, folder, state) {
      const isExisting = state.existingIds.has(folder.id);
      const isSelected = state.selectedIds.has(folder.id);

      row.element.dataset.folderId = folder.id;
      row.element.classList.toggle("folder-list__item--existing", isExisting);
      row.element.classList.toggle(
        "folder-list__item--selected",
        isSelected && !isExisting
      );

      row.checkbox.disabled = isExisting;
      row.checkbox.checked = isExisting || isSelected;
      row.status.hidden = !isExisting;

      if (row.name.textContent !== folder.name) {
        row.name.textContent = folder.name;
      }

      const nextPath = formatFolderPath(folder);
      if (row.path.textContent !== nextPath) {
        row.path.textContent = nextPath;
      }
    },
  });

  return core;
}
