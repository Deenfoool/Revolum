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
- [x] Batch import progress and cooperative cancellation between files; previously imported assets stay in project
- [ ] Mid-file abort for parser/decoder work
- [x] Conservative preflight memory budgeting for SfM/3DGS frames against actual WebGPU binding limit, incl. 360° pano expansion
- [ ] Full GPU allocation estimator and peak decoder memory audit on real devices

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
- [x] Point-cloud point count and voxel downsample for imported PLY; edited binary PLY source persists in project and Undo/Redo
- [ ] Point-cloud axis crop, outlier cleanup and non-destructive alignment

## M3 — Browser-first reconstruction (no mandatory server)
- [x] Browser ONNX relative-depth inference (Depth Anything V2 Small q8/WASM) in a dedicated Worker
- [x] Generate triangulated textured 2.5D Mesh from a selected photo and serialize to GLB in Object Studio
- [x] Reconstruct/cancel UI, model download status and depth-map preview
- [x] Multi-view automatic camera registration and triangulation (SfM with bundled Splat.js)
- [x] True WebGPU differentiable 3DGS optimization and PLY export (anisotropic Gaussian primitives, not fake point sprites)
- [x] Per-scan Economy/Balanced/Detail memory profiles; resolution cap and conservative GPU-target/CPU-frame estimates; lowMem cleanup
- [x] Live splat preview, solved camera selector, orbit, pause/resume/finish, stage/metric reporting
- [x] Sparse colored SfM point-cloud PLY and camera JSON exports, point-cloud import to Object Studio
- [x] Per-scan SfM registration diagnostics (missing image names, coverage, sparse-point count, optional BA error)
- [x] Minimum registration/landmark quality gate before GPU training
- [x] Downloadable scan ZIP snapshot (validated Gaussian PLY, sparse cloud, cameras, diagnostics)
- [x] Cancel-before-load guard, export/data-loss warning and UI operation locks during bundle creation
- [ ] Persist and restore optimizer/trainer state (current ZIP is an export snapshot, not a resumable training state)
- [x] Experimental dense polygonal Mesh: robustly SfM-align ML depth maps, multi-view TSDF fusion, marching-tetrahedra extraction, vertex colors, GLB/PLY export, cancellation and diagnostics
- [x] Dense Mesh quality audit and cleanup: invalid / duplicated faces, edge-connected fragment pruning, open/non-manifold/winding edge counts; JSON report; identical cleaned GLB and PLY
- [ ] Traditional PatchMatch MVS, depth confidence/masking and guaranteed watertight/printable geometry
- [ ] Quantitative browser smoke test with a real ONNX inference and model/GLB roundtrip on published Pages
- [x] Local session pipeline with progress, cancellation, GPU device loss and stage/metric events
- [ ] Optional local engine connector for GPU-grade multi-view workflows
- [ ] COLMAP SfM/MVS mesh reconstruction
- [x] Multi-view vertex-color sampling and skipped-camera calibration diagnostics
- [ ] UV texture-atlas baking, semantic masking and deeper reconstruction diagnostics
- [x] Gaussian Splatting training and preview via vendored Splat.js (requires WebGPU)
- [ ] WebGPU browser smoke test on real photo sets and exported PLY visual/format checks (structure/header checks implemented)
- [ ] GPU cloud engine as later optional deployment

## M4 — Production workflows
- [ ] Scene assembly from multiple independent scans
- [x] First-pass Dense Mesh topology diagnostics: boundary / non-manifold / winding checks; automatic zero-area face removal and optional dust fragment pruning
- [x] Bounded single-Dense-Mesh vertex clustering with RGB preservation, processed-GLB persistence and Worker execution
- [x] Consistent indexed triangle winding repair; outward orientation for closed components and vertex normal recompute; refuse non-manifold repair
- [x] Preserve processing method and diagnostic report through local snapshots and portable ZIP
- [x] Bounded QEM interior edge-collapse with boundary protection, manifold-link and normal-flip guards (12k face cap); processing survives GLB/Undo/ZIP
- [x] Bounded self-intersection candidates audit, explicit complete/incomplete state, topology/relative bounding-box/closed-shell signed-volume report; export JSON
- [ ] CAD-grade self-intersection and adjacent-touch detection, measured wall thickness, physical scale calibration and verified printability
- [ ] UV/textured/multi-mesh editing, hole filling and more advanced QEM constraints
- [ ] Measuring against a known physical reference
- [ ] Versioned portable projects and migrations
- [ ] Export adapters and licensing/compliance audit

## M2 delivered so far
- Camera permission and capture require HTTPS/localhost; tracks stop when the dialog closes or page is hidden.
- Locally decoded video frames can be prepared from compatible MP4/WebM/MOV sources. Browser codec support varies; no server transcoding.
- Similarity and sharpness indicators are approximate warnings, not certainty about overlap or success of SfM.

## Explicit limits in M1
- Single photo: estimated relative monocular depth produces a 2.5D mesh. Multi photo: SfM and learned 3D Gaussian splats run in WebGPU; separate experimental TSDF fusion creates polygonal geometry from SfM-calibrated per-photo ML depths. None guarantees watertightness or calibrated metric scale.
- glTF can use external resources when uploaded together and unique by filename. OBJ/MTL texture import is supported with matching files. Nested duplicate basenames are not supported. OBJ export doesn't include MTL; STL has no textures and is not guaranteed manifold.
- The photo warnings are heuristics, not a photogrammetry success metric.
- A local save can disappear when browser data is cleared; use ZIP export for backups.
- Single-image ML, Three.js/ZIP/icon runtime still use external static hosts. Multi-view SfM/3DGS is pinned locally in vendor/splatjs. Hosting: GitHub Pages Deploy from a branch main/root; no Actions.
