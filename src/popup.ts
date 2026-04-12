import { createBookmarkService } from "./popup/bookmark-service.js";
import {
  createPopupController,
  type PopupController,
} from "./popup/controller.js";
import { createCreateFolderSheet } from "./popup/create-folder-sheet.js";
import { getPopupElements } from "./popup/dom.js";
import { createMainFolderList } from "./popup/main-folder-list.js";

const elements = getPopupElements();
const service = createBookmarkService();

let controller: PopupController;

const mainFolderList = createMainFolderList({
  listElement: elements.mainPicker.resultsList,
  onToggle(folderId, shouldSelect) {
    controller.handleMainSelectionChange(folderId, shouldSelect);
  },
});

controller = createPopupController({
  elements,
  service,
  mainFolderList,
});

createCreateFolderSheet({
  elements: elements.createFolderSheet,
  returnFocusElement: elements.mainPicker.searchInput,
  service,
  getFolderIndex() {
    return controller.getFolderIndex();
  },
  onFolderCreated(notification) {
    controller.handleCreatedFolder(notification);
  },
});

controller.bootstrap().catch((error: unknown) => {
  console.error("Failed to initialise popup", error);
});
