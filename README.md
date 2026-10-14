# Revolum

**Capture. Reconstruct. Create.** A browser-based studio for organizing photo scans, inspecting and editing 3D assets, and exporting scenes.

Revolum is a static-first project designed for GitHub Pages. The first milestone offers a real Three.js workspace, a photo-set quality checker with camera capture and local video-to-frame extraction, mesh import/edit/export and local project persistence. **It does not claim to reconstruct a mesh from photographs in the browser yet**; photogrammetry and Gaussian Splatting are tracked as future optional compute-engine integrations.

See [ROADMAP.md](ROADMAP.md) for implemented and planned features.

## Hosting

Use GitHub Pages → **Deploy from a branch** → `main` / `(root)`. No GitHub Actions or server required for the first milestone.

## Development

Run a static server in this repository (ES modules need HTTP): `python3 -m http.server 8080`, then open `http://localhost:8080`. The app uses pinned Three.js and Lucide/JSZip CDN dependencies; the first load needs internet access.

## Formats

Imports: GLB, self-contained glTF, OBJ (geometry), STL, PLY (mesh or point cloud). Exports: GLB (materials where supported), OBJ (geometry only), STL (geometry only, no printability guarantee), and a ZIP project with source photos/assets and manifest. Local saves use IndexedDB.

## Privacy

Photos, video frames and model files stay in the user's browser; no upload endpoint or analytics is included in this version. Local browser storage can be cleared by the user/browser, so export a ZIP backup.

## License

MIT. Third-party dependencies are distributed by their respective authors and retain their licenses.
