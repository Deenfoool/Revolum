# Revolum

**Capture. Reconstruct. Create.** A browser-based studio for organizing photo scans, inspecting and editing 3D assets, and exporting scenes.

Revolum is a static-first project designed for GitHub Pages. The first milestone offers a real Three.js workspace, a photo-set quality checker and local JPEG EXIF inspector (including GPS presence warnings), with camera capture and local video-to-frame extraction, mesh import/edit/export, batch import progress and cancellation between files, and local project persistence. **Photo Scan now performs local single-image depth reconstruction** using Depth Anything V2 Small (ONNX) and builds a real textured 2.5D mesh from the predicted relative depth. Multi-view Structure-from-Motion, automatic camera registration and genuine WebGPU-trained Gaussian Splatting are now available as a separate Photo Scan mode using pinned, MIT-licensed Splat.js. Experimental depth-assisted multi-view polygonal TSDF mesh extraction is available; guaranteed watertight geometry, traditional PatchMatch MVS and absolute metric scale remain open.

See [ROADMAP.md](ROADMAP.md) for implemented and planned features.

## Publishing (same branch-based scheme as Safelight)

Production entry: [`index.html`](index.html) at the repository root. GitHub Pages **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` → Folder: `/(root)` → Save**. The root `.nojekyll` file is intentionally empty and **must stay committed**: GitHub serves the static files without a Jekyll build. No build output, deploy workflow or GitHub Actions configuration is required.

Intended URL: https://deenfoool.github.io/Revolum/ (GitHub Pages source must be configured in repository settings). Paths in the entry page are relative to the repository subpath (`./styles.css`, `./src/main.js`, `./assets/favicon.svg`). Don't change them to domain-root paths (`/src/...`) or Pages will point at the wrong location.

Unlike Safelight, this early prototype still loads pinned Three.js, Lucide, JSZip and Transformers.js from jsDelivr. **The full multi-view SfM/WebGPU 3DGS engine is pinned and vendored locally** under `vendor/splatjs`, including its workers; only the existing single-image ML mode downloads model weights. The model files download once from Hugging Face and are cached when supported. Both public static hosts require internet access on first use. **Photos are processed locally: there is no inference or upload endpoint.** Vendoring all dependencies for fully offline runtime remains a future task. Vendoring dependencies for fully local runtime is a separate roadmap item.

## Development

Run a static server in this repository (ES modules need HTTP): `python3 -m http.server 8080`, then open `http://localhost:8080`. The app uses pinned Three.js and Lucide/JSZip CDN dependencies; the first load needs internet access.

## Single-photo reconstruction (static GitHub Pages, no compute server)

1. In **Photo Scan**, upload an image or capture a photo. Select its thumbnail.
2. Select mesh detail and depth strength, then click **Создать 3D из выбранного фото**. The browser downloads the ~27 MB q8 ONNX model and Transformers.js runtime on first use. Inference runs in a dedicated Web Worker on the user's CPU via WASM (WebGPU is not required).
3. Revolum constructs a real triangulated textured surface from the network's relative depth map, serializes it as a GLB, and adds it to **Object Studio**. You can transform it, combine independently generated surfaces manually, save the project, or export GLB / geometry-only OBJ or STL.

This is **2.5D, not full multi-view SfM/MVS**. No back/hidden surfaces, watertight mesh, or real-world dimensional accuracy can be inferred from one image. This single-image algorithm does not register or fuse different photos; select the dedicated multi-view mode for SfM and trained Gaussian Splatting. The user can stop inference (this terminates and resets the worker). Unsupported browsers, insufficient memory and blocked CDN/model hosts produce an explicit error rather than a fabricated mesh.

## Multi-view SfM + genuine Gaussian Splatting (static Pages)

1. Shoot **8–120 overlapping photos of the same static scene** (more views with parallax produce better registration). Upload them into Photo Scan in roughly capture order.
2. In **Многокадровый 3D Gaussian Splatting**, select Draft / Balanced / Quality (training duration) and Economy / Balanced / Detail (feature and training-frame resolution), then click **Собрать 3D-пространство**. Before processing, Revolum checks the adapter's WebGPU binding limit and image dimensions, automatically caps training resolution, and shows conservative packed-target and CPU-frame estimates. Panoramas are budgeted as six cubemap faces each. These numbers **are not total VRAM usage**; other GPU buffers, decoders and optimizers consume extra memory. Requires a WebGPU-capable browser and suitable GPU/RAM. Files are decoded locally; no cloud upload.
3. Vendored [Splat.js](https://github.com/arrival-space/splat.js) detects/matches SIFT features, estimates camera poses (incremental SfM / bundle adjustment), triangulates shared 3D points, initializes splats and trains **real anisotropic Gaussians on your GPU**. Progress and metrics appear in the UI; you can pause, resume, or finish training early. The WebGPU canvas previews the changing result; select solved camera views or orbit with the mouse.
4. Export a standard **trained splat `.ply`** (with spherical-harmonic coefficients), a **sparse colored point-cloud `.ply`** and camera poses (`.json`). For a consistent backup, click **Пакет скана (.zip)**: it pauses training and includes all three outputs plus a diagnostic manifest, without duplicating the original photos. The sparse cloud can be added to Object Studio and exported further. Gaussian PLY is a radiance-field representation, **not** a watertight mesh or GLB.

The **Splat.js source** (MIT © Stratum1 GmbH) is pinned in-repo at commit `88efe9aaf32279b0b9bcb781ea0deb4d60c49dff`. See [third-party notices](THIRD_PARTY_NOTICES.md) and bundled licenses. This is not a cloud service and **does not need GitHub Actions, npm build or a compute backend**. Training requires WebGPU; on unsupported devices, use the single-photo WASM 2.5D mode. Trained GPU state is not retained after a reload. Download the trained PLY or scan ZIP before closing or switching projects (the app warns while results are not exported); source photos still live in your local project/ZIP. An SfM registration report identifies photos that failed to register; training is blocked when fewer than half the input frames (minimum four) or fewer than 50 shared points are recovered. A scan ZIP preserves a visual/export snapshot, not a resumable optimizer state. Automatic multi-view dense polygonal mesh fusion (MVS), exact scale and print-ready watertight meshes remain future items.

## Reconstruction reliability and diagnostics

The multi-view engine validates input counts/sizes before processing and checks registration coverage before allocating the Gaussian trainer. The per-run report shows registered and rejected source images, number of shared landmarks and RMS bundle-adjustment error when available. A low-registration scan fails with an actionable message rather than spending GPU time on a misleading result. The new scan bundle contains `gaussian-splats.ply`, `sparse-cloud.ply`, `camera-poses.json`, `manifest.json` and a short README; it excludes source photographs by design. Use Project ZIP for those. Exporting trained PLY also pauses active training; resuming marks the evolving GPU result as not yet backed up. These safeguards and structural tests are not substitutes for testing a real GPU/photo dataset on the published page.

## Mesh optimization (M4)

Select a newly generated **Dense Mesh** in Object Studio. Its inspector offers two operations. **Упростить Mesh** runs bounded spatial vertex clustering (1–6% of the mesh diagonal), preserving averaged RGB vertex colours and removing collapsed/duplicate triangles; this is a fast approximation, **not** quadric-error decimation and can introduce open or non-manifold geometry. **Согласовать нормали** first rejects invalid/non-manifold input, then consistently orients neighboring indexed triangles and reverses any closed component with negative signed volume. Open components have no inferred universal outward direction. Both operations recompute vertex normals, report topology, execute in a Web Worker and serialize a new GLB *before* replacing the original. On failure, the original remains unchanged. Their source file and processing metadata survive autosave, Undo/Redo and Project ZIP restore. Rigged, multi-mesh, textured and unindexed assets are intentionally excluded.

These tools **do not** test triangle self-intersections, wall thickness or metric print dimensions and never certify print-readiness. A separate intersection/printability audit remains on the roadmap.

## Point-cloud cleanup (M2)

Imported PLY point clouds (including Revolum's sparse SfM output) now display their point counts in Object Studio. Select a cloud and choose **Voxel-прореживание** to keep one original point per spatial cell. Cell size is a percentage of the cloud's **local bounding-box diagonal**; SfM has arbitrary, not metric, scale. The edited result is re-encoded as a binary PLY source, so local autosave, named projects, ZIP backups, Undo/Redo, and subsequent restores retain the reduced points. This is downsampling, not dense surface reconstruction, noise removal, or an edit to Gaussian opacity/SH data. Gaussian PLY remains a separate representation and must not be treated as editable polynomial geometry.

## Experimental multi-view polygonal Mesh (browser-local)

After the regular multi-view SfM step has solved the camera poses, **Построить общий Mesh** creates a depth-assisted **TSDF** mesh from the *same* registered photo set. Choose 40 / 56 / 72 volume detail and 6 / 10 / 16 maximum registered views. The implementation:

1. Runs Depth Anything V2 inference independently on selected registered source photos, in-browser WASM, with progress and cancellation. The model is downloaded on first use.
2. Reprojects SfM's 3D landmarks into each solved camera, robustly fits each predicted *relative* depth map to actual SfM camera Z, and rejects poorly calibrated maps. It tolerates inverted predictor depth conventions.
3. Fuses only grid regions observed by **at least two** aligned cameras into a bounded, signed-distance volume, and extracts an **indexed polygon mesh** with marching tetrahedra. Vertex colours are sampled from the source photographs where their depths agree with the reconstructed surface.
4. Runs **topology diagnostics** before export: rejects zero-area and duplicate triangles, optionally prunes small edge-disconnected fragments, compacts vertices, counts boundary / non-manifold edges and winding conflicts. Both GLB and PLY use the **same cleaned mesh**. The JSON report is downloadable alongside them.
5. Saves the result as a real GLB model in Object Studio (including its source file for Undo/Redo and ZIP persistence). **Download Mesh (.glb)** and **Download Mesh (.ply)** are available after a successful build.

This is an *experimental depth-assisted MVS approximation*, not a COLMAP PatchMatch reconstruction and not derived by transforming 3DGS into triangles. It requires at least three successfully calibrated views. It covers only visible, corroborated regions; open boundaries, incomplete surfaces, arbitrary SfM scale and ML-depth errors are expected. Topological closure is reported when detectable, but this **does not certify print readiness**: self-intersections, normal field consistency beyond edge winding, physical units and minimum wall thickness are not fully checked. Turning off small-fragment pruning preserves separate pieces but still discards objectively invalid or duplicate triangles. It does not promise watertightness, texture-atlas UV baking or print readiness. Cloud/GPU compute backends are **not** required; volumetric fusion is handled in a Worker with a hard grid/triangle cap. Do not treat the output coordinates as metres without external calibration.

## Formats

Imports: GLB, glTF (+ matching BIN/textures), OBJ (+ matching MTL/textures), STL, PLY (mesh or point cloud). Select related files together, or use Import model folder. Linked files are matched by filename; filenames must be unique within a model import. Exports: GLB (materials where supported), OBJ (geometry only), STL (geometry only, no printability guarantee), and a ZIP project with source photos/assets and manifest. Local autosave and up to 12 named project snapshots use IndexedDB (browser/device local only). ZIP remains the portable backup. Batch import cancellation is cooperative: it stops before the next file, but does not interrupt parsing the current file.

## Privacy

Photos, video frames and model files stay in the user's browser; no upload endpoint or analytics is included in this version. Local browser storage can be cleared by the user/browser, so export a ZIP backup.

## License

MIT. Third-party dependencies are distributed by their respective authors and retain their licenses.
