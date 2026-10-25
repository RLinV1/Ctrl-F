# Tasks

## 1. Photo sources
- [x] 1.1 Switch S3 current/results/item snapshots and historical evidence to raw keys for browser, Pi-ready and legacy HTTP paths; verify store-level Playwright checks.
- [x] 1.2 Select original Postgres photo keys for Results/Items/History and document raw retention/display behavior; verify reader mapping and private signing remain compatible.

## 2. Target overlay and review
- [x] 2.1 Cover raw source plus single-target circle and historical geometry in desktop/mobile Playwright, and pass TypeScript/lint/OpenSpec validation.
- [x] 2.2 Commit/push feature branch and leave it separate from dev for review; record validation and local preview status.

Verification: 124 Playwright tests passed across desktop/mobile. Regression
coverage checks raw sources for browser, Pi-ready and legacy HTTP requests,
current/list/item/history mappings, and only the selected target circle at
unchanged normalized coordinates. TypeScript, targeted ESLint, strict OpenSpec
and diff checks passed. Read-only desktop DB/storage check confirmed the latest
three original-photo keys have positive dimensions and readable private originals.
Local feature preview runs at port 3000 with root env; desktop/Pi are unchanged.

Publish target: `feat/raw-photo-target-overlay`; keep dev unmerged and use the
local feature preview for review. Live preview API check returned 21 item
snapshots, all signed raw incoming photo URLs.
