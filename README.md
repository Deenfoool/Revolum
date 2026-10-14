# Revolum

**Capture. Reconstruct. Create.** A browser-based studio for organizing photo scans, inspecting and editing 3D assets, and exporting scenes.

Revolum is a static-first project designed for GitHub Pages. The first milestone offers a real Three.js workspace, a photo-set quality checker with camera capture and local video-to-frame extraction, mesh import/edit/export and local project persistence. **It does not claim to reconstruct a mesh from photographs in the browser yet**; photogrammetry and Gaussian Splatting are tracked as future optional compute-engine integrations.

See [ROADMAP.md](ROADMAP.md) for implemented and planned features.

## Publishing (same branch-based scheme as Safelight)

Production entry: [`index.html`](index.html) at the repository root. GitHub Pages **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` → Folder: `/(root)` → Save**. The root `.nojekyll` file is intentionally empty and **must stay committed**: GitHub serves the static files without a Jekyll build. No build output, deploy workflow or GitHub Actions configuration is required.

Intended URL: https://deenfoool.github.io/Revolum/ (GitHub Pages source must be configured in repository settings). Paths in the entry page are relative to the repository subpath (`./styles.css`, `./src/main.js`, `./assets/favicon.svg`). Don't change them to domain-root paths (`/src/...`) or Pages will point at the wrong location.

Unlike Safelight, this early prototype still loads pinned Three.js, Lucide and JSZip from jsDelivr; an internet connection and access to that CDN are currently required. Vendoring dependencies for fully local runtime is a separate roadmap item.

## Development

Run a static server in this repository (ES modules need HTTP): `python3 -m http.server 8080`, then open `http://localhost:8080`. The app uses pinned Three.js and Lucide/JSZip CDN dependencies; the first load needs internet access.

## Formats

Imports: GLB, glTF (+ matching BIN/textures), OBJ (+ matching MTL/textures), STL, PLY (mesh or point cloud). Select related files together, or use Import model folder. Linked files are matched by filename; filenames must be unique within a model import. Exports: GLB (materials where supported), OBJ (geometry only), STL (geometry only, no printability guarantee), and a ZIP project with source photos/assets and manifest. Local saves use IndexedDB.

## Privacy

Photos, video frames and model files stay in the user's browser; no upload endpoint or analytics is included in this version. Local browser storage can be cleared by the user/browser, so export a ZIP backup.

## License

MIT. Third-party dependencies are distributed by their respective authors and retain their licenses.
