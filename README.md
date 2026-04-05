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

- `src/` – TypeScript sources for the popup and background scripts.
- `static/` – HTML, CSS, icons, and the source manifest copied directly into the build.
- `dist/` – Build artifacts produced by `npm run build`, ready to load in Firefox.
- `scripts/build.js` – Lightweight build script that copies static assets and runs the TypeScript compiler.

## Current behaviour

- Autofills the bookmark name from the active tab.
- Searches folders by their name.
   - An alternative option that can become a setting in the future: Searches folders by any portion of their path (e.g. typing `dev/q` matches `Bookmarks Toolbar / Dev / Quick References`).
- Allows multi-select with checkboxes; each selected folder receives a bookmark on save.
- Focuses the folder search field as soon as the popup opens so typing can begin immediately.
- Pressing `Enter` while typing selects every currently visible search result and keeps focus in the input for the next query.
- Highlights folders where the current tab is already bookmarked (pre-checks them, greys the row, and labels “bookmark exists here”).
- Waits for the selected bookmarks to be written before closing the popup.
- Shows an inline error in the popup if bookmark creation fails.
- After a failed multi-folder save, refreshes which folders already contain the bookmark and keeps only the remaining folders selected for retry.
- Keeps the familiar Firefox bookmark editor layout to ease muscle memory.

## Keyboard shortcut

The popup can be opened from any tab with the extension command shortcut: `Ctrl+Shift+E` on Windows/Linux and `Command+Shift+E` on macOS. You can view or remap this shortcut in Firefox via **about:addons → Manage Extension Shortcuts**.

## Reproduce the submitted build

Run these commands from the repository root:

```bash
npm ci
npm run build
```

Build output is written to `dist/`:

- `background.js` and `popup.js` are generated from `src/background.ts` and `src/popup.ts` by `tsc`.
- `manifest.json`, `popup.html`, `popup.css`, and `icons/*` are copied from `static/` without transformation.

The submitted extension package is created from the `dist/` contents only, with no manual edits after `npm run build`.

### Build tooling disclosure

- Uses the TypeScript compiler (`tsc`) to transpile `.ts` source files into `.js`.
- Uses `scripts/build.js` to copy static assets and invoke `tsc`.
- Does not use webpack/rollup/esbuild bundling, minification, template engines, or obfuscation.

### Pre-submission validation

```bash
npm run type-check
npx web-ext lint -s dist
```

After those checks pass, create the submission zip from inside `dist/` so the archive contains the built files at its root.

macOS:

```bash
cd dist
zip -r -FS ../../bookmark-folder-finder-0.1.1.zip . -x '*.DS_Store'
```

Linux:

```bash
cd dist
zip -r -FS ../../bookmark-folder-finder-0.1.1.zip .
```

Windows (PowerShell):

```powershell
Set-Location dist
Compress-Archive -Path * -DestinationPath ..\..\bookmark-folder-finder-0.1.1.zip -Force
```

### Notable limitations

- The *Remove bookmark* control is visually present for parity with the native UI but disabled until removal logic is implemented.
- Query results are capped at 100 entries for responsiveness; refine the search term to narrow further.
