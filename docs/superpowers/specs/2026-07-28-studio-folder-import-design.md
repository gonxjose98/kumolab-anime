# Studio: import media from internal folders

**Date:** 2026-07-28
**Status:** Approved (design), not yet implemented
**Scope:** Sub-project A of three. Series metadata (B) and the interactive Top 10 page (C) are explicitly out of scope.

## Problem

Studio's Import button opens only the OS file sheet (Photo Library / Take Photo / Choose File). There is no way to pull media from KumoLab's own media-library folders, so there is no way to keep source footage organized across edits.

This blocks the motivating use case: recurring series ("Top 10 Ghibli Movies", "Day 47 of aesthetic anime scenes") where the same curated pool of clips is reused across many posts.

## Findings that shaped the design

Two facts discovered while scoping, both load-bearing:

1. **A folder-browsing picker already exists.** `src/components/admin/studio/MediaPickerModal.tsx` browses folders and media and returns selections in tap order. It renders video but renders it disabled (L135, L265) because it was built for image-only carousels.

2. **Saving video to a folder would silently delete it within 24h.** `upload-sign` routes any video to the `blog-videos` bucket (`src/app/api/admin/upload-sign/route.ts:34`). The cleanup worker sweeps that entire bucket every run and builds its keep-set *only* from `posts.social_ids.staged_video_url` / `original_video_url` (`src/lib/engine/cleanup-worker.ts:216-232`). A library clip is referenced by `studio_media.url`, so it is classified as an orphan and removed once older than 24h (L251-254).

   This has not bitten anyone because the library is empty (0 folders, 0 media in production) and the carousel flow is image-only, and images go to `blog-images`, which is not swept. The sweep exists deliberately to stop the storage ratchet that exceeded the free quota in July 2026, so it must not be weakened.

## Decisions

| Decision | Choice |
|---|---|
| How media enters folders | Studio import also offers to save to a folder |
| Where library media is stored | New `studio-library` bucket |
| Save-to-folder friction | Prompt after import, with Skip |
| What picking from a folder does | Offer both "Add to timeline" and "Add to pool" |
| Build approach | Extend `MediaPickerModal` rather than fork it |

## Design

### 1. Storage and data model

Create a Supabase storage bucket `studio-library` (public read, service-role write). The cleanup worker only sweeps `VIDEO_BUCKET = 'blog-videos'` (`cleanup-worker.ts:15`), so the new bucket is out of its reach structurally, not by a rule a future change has to remember.

`upload-sign` gains `destination: 'post' | 'library'`:

- `'library'` → `studio-library`, for both images and video.
- absent / `'post'` → today's behaviour (`blog-videos` / `blog-images`), unchanged.

No schema migration. `studio_media` already carries `folder_id`, `url`, `kind`, `filename`, `mime`, and its CHECK constraint already permits `'video'`. The library is empty, so there is nothing to migrate.

Consequence to accept explicitly: `studio-library` is permanent by design and will grow. Pruning is a deliberate act on the Media page, not something the cleanup worker does. The org is on Supabase Pro (100 GB); current usage is ~416 MB.

### 2. Write path — device → folder

Ordering matters for perceived speed:

1. Files register to OPFS exactly as today (`MediaLibrary.tsx:50-74`), so editing starts immediately with no upload wait.
2. *Then* a compact "Save to library?" sheet appears: existing folders, "New folder", and "Skip".
3. If a folder is chosen, upload runs **in the background** while editing continues: `upload-sign` (destination `library`) → signed PUT → `POST /api/admin/studio/media` with `{ folderId, url, kind, filename, mime }`.

Each pool item shows its own save state. A failed upload offers retry and never disturbs the edit, because the local OPFS copy is what the timeline is using. The uploaded URL is recorded in the library only; the in-flight asset is deliberately **not** hot-swapped to the remote URL mid-edit.

"New folder" reuses `POST /api/admin/studio/folders`.

### 3. Read path — folder → Studio

`MediaPickerModal` gains two explicit props:

- `kinds?: ('image' | 'video')[]` — default `['image']`. The carousel builder passes nothing and is therefore bit-for-bit unchanged. Studio passes `['image', 'video']`, which lifts the video-disabled restriction only where wanted.
- A second confirm action, so Studio can present **Add to timeline** and **Add to pool** side by side. The carousel keeps its single `confirmLabel`/`onConfirm`.

`MediaLibrary.tsx` gains a "Library" button beside Import that opens the picker.

On confirm, for each URL **in tap order**:

1. Build a `MediaAsset` with `origin: 'upload'` and `remoteUrl`, mirroring `addPreset` (`MediaLibrary.tsx:21-37`).
2. `probeMedia(url, kind)` for duration and dimensions.
3. `addMedia(asset)`.
4. For the timeline action only, `addAssetToTimeline(asset)` (`clipFactory.ts:14-41`), awaited sequentially so tap order becomes clip order.

`mediaStore` already fetches `remoteUrl` when it has no local bytes (`store/mediaStore.ts:52-58`), so playback needs no new plumbing.

## Testing

Unit tests:

- `upload-sign` bucket routing for each `destination` value, including the default.
- The kind-filtering predicate (selectable vs disabled) in the picker.
- Library-URL → `MediaAsset` mapping.

Manual verification in a real browser at 390px width, since Studio-on-phone is the actual use case. Per the existing Studio testing notes: grant the dev user the temp `studio` permission and revert it afterwards, and never export-test against a live post.

## Risks

| Risk | Mitigation |
|---|---|
| Library media deleted by the cleanup sweep | Separate bucket the sweep never lists |
| Background upload fails silently | Per-item save state + retry; edit is never blocked |
| Carousel flow regresses | `kinds` defaults to `['image']`; carousel call site unchanged |
| Storage grows unbounded | Accepted and documented; pruning is manual on the Media page |
| Large mobile uploads feel slow | Upload is backgrounded and skippable |

## Out of scope

- Series metadata (`series`, `episode_number`) — sub-project B.
- The interactive reorderable Top 10 page — sub-project C.
- Migrating existing media (there is none).
- Changing Studio export behaviour.
