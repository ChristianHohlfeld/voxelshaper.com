# VoxelShaper Suite 2026-10-01 — Editor

## Release

**Suite version:** 1.1.0  
**Tag:** `vs-2026-10-01`

## Highlights

- Morph Editor projects remain **native Z-up** through upload, Hub storage and reload.
- Hub-imported projects are applied without unconditional Y/Z remapping.
- The old `remapCatalogZUpToYUp` compatibility helper is now an explicit no-op so stale call sites cannot rotate project data.
- Editor -> Hub -> Editor roundtrips preserve voxel coordinates exactly.
- Rendering concerns are separated from persistence: Three.js/Y-up conversion belongs only in renderers.

## Contract

The editor defines the canonical persisted coordinate system: Z-up. Saving, uploading, importing and reopening a project must not alter axes or orientation.

## Verification

Release gate asserts the axis-preserving Hub import path and discovers the Playwright suite before publishing the GitHub release.
