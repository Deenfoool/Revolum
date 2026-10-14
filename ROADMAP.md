# Revolum roadmap

Static-first photogrammetry and 3D workspace. Status is based on code delivered, not on mock UI.

## M1 — Usable static studio (v0.1)
- [x] Responsive dark UI, Object Studio and Photo Scan
- [x] Three.js orbit camera, selection, transform gizmos and numeric transforms
- [x] GLB / standalone glTF / OBJ / STL / PLY imports
- [x] Primitive geometry, scene hierarchy, rename/delete, camera views and PNG snapshot
- [x] GLB, geometry-only OBJ and STL exports
- [x] Photo import, thumbnail gallery, resolution and approximate exposure checks
- [x] IndexedDB local project save/restore, ZIP backup and restore
- [x] Basic keyboard commands and limited undo/redo
- [ ] Browser smoke tests across Chrome/Firefox/Safari and real sample files
- [ ] Full asset lifecycle / import progress and cancellation for large scans

## M2 — Scan preparation
- [x] Camera capture and video-to-frames (browser-only, video up to 5 minutes and 48 sampled frames)
- [x] Bounded local JPEG EXIF inspector (camera, lens, date, ISO, orientation; GPS presence warning, no coordinates)
- [ ] Visual camera coverage map and non-JPEG metadata support
- [x] Heuristic near-duplicate, low-detail, resolution and exposure warnings (not reliable blur/focus measurement)
- [ ] Actual sharp-frame selection and perceptual quality calibration
- [x] Flat filename-based multi-file glTF/BIN/textures and OBJ/MTL/textures import and ZIP dependency persistence
- [ ] Nested path collisions, complex material fidelity and glTF asset validation
- [x] Local multi-project library (12 named IndexedDB snapshots; separate autosave slot)
- [ ] Project quotas, deduplication and storage-usage view
- [ ] Point-cloud tools (crop, align, measure and cleanup)

## M3 — Real reconstruction (separate optional compute engine)
- [ ] Define job protocol, input validation and progress events
- [ ] Local worker connector, not embedded in GitHub Pages
- [ ] COLMAP SfM/MVS mesh reconstruction
- [ ] Texture baking, masking and reconstruction diagnostics
- [ ] Gaussian Splatting training and preview
- [ ] GPU cloud engine as later optional deployment

## M4 — Production workflows
- [ ] Scene assembly from multiple independent scans
- [ ] Mesh decimation, normals, UVs, watertightness and printable-mesh checks
- [ ] Measuring against a known physical reference
- [ ] Versioned portable projects and migrations
- [ ] Export adapters and licensing/compliance audit

## M2 delivered so far
- Camera permission and capture require HTTPS/localhost; tracks stop when the dialog closes or page is hidden.
- Locally decoded video frames can be prepared from compatible MP4/WebM/MOV sources. Browser codec support varies; no server transcoding.
- Similarity and sharpness indicators are approximate warnings, not certainty about overlap or success of SfM.

## Explicit limits in M1
- Photograph upload does **not** create real 3D reconstruction yet.
- glTF can use external resources when uploaded together and unique by filename. OBJ/MTL texture import is supported with matching files. Nested duplicate basenames are not supported. OBJ export doesn't include MTL; STL has no textures and is not guaranteed manifold.
- The photo warnings are heuristics, not a photogrammetry success metric.
- A local save can disappear when browser data is cleared; use ZIP export for backups.
- CDN access is needed on first load. Hosting: GitHub Pages Deploy from a branch main/root; no Actions.
