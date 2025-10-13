# Bookmark Folder Finder

A Firefox extension popup that mimics the native bookmark editor while adding a search-first experience for choosing folders. Type to filter folders, select one or more, and save the current tab into each selected location.

## Development

1. Install dependencies:
```bash
npm install
```
2. Build the extension assets:
```bash
npm run build
```
   Bundled files land in the `dist/` directory alongside the static assets and manifest.
3. Load the extension in Firefox:
   - Open `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on…**.
   - Pick any file inside the `dist/` folder (for example `dist/manifest.json`).

## Project layout

- `src/` – TypeScript sources compiled to the popup script.
- `static/` – HTML, CSS, and manifest files that get copied to `dist/` during builds.
- `scripts/build.js` – Lightweight build step that copies static assets and runs the TypeScript compiler.

## Current behaviour

- Autofills the bookmark name from the active tab.
- Searches folders by any portion of their path (e.g. typing `dev/q` matches `Bookmarks Toolbar / Dev / Quick References`).
- Allows multi-select with checkboxes; each selected folder receives a bookmark on save.
- Immediately closes the popup after clicking **Save** while a background script writes bookmarks.
- Keeps the familiar Firefox bookmark editor layout to ease muscle memory.

### Notable limitations

- The *Remove bookmark* control is visually present for parity with the native UI but disabled until removal logic is implemented.
- Query results are capped at 100 entries for responsiveness; refine the search term to narrow further.
