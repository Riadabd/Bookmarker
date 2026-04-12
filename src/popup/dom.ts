type ElementConstructor<T extends HTMLElement> = {
  new (): T;
};

export type PopupElements = {
  mainPicker: {
    nameInput: HTMLInputElement;
    searchInput: HTMLInputElement;
    searchClearButton: HTMLButtonElement;
    resultsList: HTMLUListElement;
  };
  footer: {
    saveButton: HTMLButtonElement;
    saveError: HTMLParagraphElement;
    removeButton: HTMLButtonElement;
  };
  createFolderSheet: {
    trigger: HTMLButtonElement;
    sheet: HTMLDivElement;
    form: HTMLFormElement;
    nameInput: HTMLInputElement;
    parentSearchInput: HTMLInputElement;
    parentClearButton: HTMLButtonElement;
    parentResultsList: HTMLUListElement;
    cancelButton: HTMLButtonElement;
    submitButton: HTMLButtonElement;
  };
};

export function getRequiredElement<T extends HTMLElement>(
  id: string,
  expectedType: ElementConstructor<T>
): T {
  const element: HTMLElement | null = document.getElementById(id);
  if (!(element instanceof expectedType)) {
    throw new Error(`Expected ${expectedType.name} for #${id}`);
  }

  return element;
}

export function getPopupElements(): PopupElements {
  return {
    mainPicker: {
      nameInput: getRequiredElement("bookmark-name", HTMLInputElement),
      searchInput: getRequiredElement("folder-search", HTMLInputElement),
      searchClearButton: getRequiredElement(
        "folder-search-clear",
        HTMLButtonElement
      ),
      resultsList: getRequiredElement("folder-results", HTMLUListElement),
    },
    footer: {
      saveButton: getRequiredElement("save-bookmark", HTMLButtonElement),
      saveError: getRequiredElement("save-error", HTMLParagraphElement),
      removeButton: getRequiredElement("remove-bookmark", HTMLButtonElement),
    },
    createFolderSheet: {
      trigger: getRequiredElement("create-folder-trigger", HTMLButtonElement),
      sheet: getRequiredElement("create-folder-sheet", HTMLDivElement),
      form: getRequiredElement("create-folder-form", HTMLFormElement),
      nameInput: getRequiredElement("create-folder-name", HTMLInputElement),
      parentSearchInput: getRequiredElement(
        "create-folder-parent-search",
        HTMLInputElement
      ),
      parentClearButton: getRequiredElement(
        "create-folder-parent-clear",
        HTMLButtonElement
      ),
      parentResultsList: getRequiredElement(
        "create-folder-parent-results",
        HTMLUListElement
      ),
      cancelButton: getRequiredElement("create-folder-cancel", HTMLButtonElement),
      submitButton: getRequiredElement(
        "create-folder-submit",
        HTMLButtonElement
      ),
    },
  };
}
