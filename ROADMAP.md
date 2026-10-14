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
- [ ] Camera capture and video-to-frames
- [ ] EXIF analysis, duplicates, sharper frame selection and visual coverage map
- [ ] Multi-file glTF resource and textured OBJ/MTL handling
- [ ] Project library with multiple saved projects
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

## Explicit limits in M1
- Photograph upload does **not** create real 3D reconstruction yet.
- glTF import is self-contained only. OBJ export doesn't include MTL; STL has no textures and is not guaranteed manifold.
- The photo warnings are heuristics, not a photogrammetry success metric.
- A local save can disappear when browser data is cleared; use ZIP export for backups.
- CDN access is needed on first load. Hosting: GitHub Pages Deploy from a branch main/root; no Actions.
