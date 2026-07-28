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

2. **Library video in `blog-videos` would be one line of code away from deletion.** `upload-sign` routes any video to `blog-videos` (`src/app/api/admin/upload-sign/route.ts:34`). The cleanup worker's slim sweep builds its keep-set *only* from `posts.social_ids.staged_video_url` / `original_video_url` (`src/lib/engine/cleanup-worker.ts:216-232`) and deletes anything unkept older than 24h (L251-254). A library clip is referenced by `studio_media.url`, which is not in that keep-set.

   **It would not actually be deleted today.** The sweep lists with `storage.from(VIDEO_BUCKET).list('', …)` (L245), which is non-recursive, and then keeps only entries with an `id`, discarding folder placeholders. Uploads land under a `manual-uploads/` prefix (`upload-sign:44`), which that listing never descends into, so only root-level objects are reachable by the sweep.

   That exemption is accidental, not designed. Making the listing recursive — a plausible future change, since a recursive sweep is what a reader would assume it already does — would delete the entire library. The design therefore treats this as a latent hazard to design out, not as a live bug being fixed.

   The sweep exists deliberately to stop the storage ratchet that exceeded the free quota in July 2026, so it must not be weakened. **Non-goal:** do not "fix" the sweep's non-recursion as part of this work.

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

Create a Supabase storage bucket `studio-library`. The cleanup worker only sweeps `VIDEO_BUCKET = 'blog-videos'` (`cleanup-worker.ts:15`), so the new bucket is out of its reach structurally, not by an accidental prefix exemption that a future refactor could remove.

**Created via a migration file**, not a dashboard click, so the bucket is reproducible and visible in version control alongside `20260716140000_studio_media_library.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-library', 'studio-library', true, 104857600,
        array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/heic','image/heif',
              'video/mp4','video/webm','video/quicktime','video/x-m4v','video/3gpp','video/mpeg'])
on conflict (id) do nothing;
```

Config decisions, all taken from the live buckets rather than invented:

- **public read** — matches both existing buckets, so public-URL handling works unchanged.
- **MIME allowlist = the union of `blog-images` and `blog-videos` as they exist in production.** `image/heic` / `image/heif` are non-negotiable: HEIC is the iPhone camera's default photo format, and omitting it would fail a phone photo save at the storage layer with an opaque signed-PUT error, on exactly the device this design targets.
- **100 MB limit**, matching `blog-videos`. The signed PUT is a single non-resumable request, so a failed upload retries the whole file; a larger cap would make a cellular failure more expensive, not more capable.

Writes are service-role only via the existing signed-upload flow. No RLS policies, matching `studio_media`'s service-role-only posture.

Library objects use a `library/` path prefix (instead of `upload-sign`'s hardcoded `manual-uploads/`), so the bucket is self-describing if a sweep is ever written for it.

**Applying it:** the repo has `supabase/migrations/` but no `config.toml` and no CI migration step, so the file does not self-apply. It is applied deliberately via `apply_migration` against the project.

`upload-sign` gains `destination: 'post' | 'library'`:

- `'library'` → `studio-library`, for both images and video.
- absent / `'post'` → today's behaviour (`blog-videos` / `blog-images`), unchanged.

No schema migration. `studio_media` already carries `folder_id`, `url`, `kind`, `filename`, `mime`, and its CHECK constraint already permits `'video'`. The library is empty, so there is nothing to migrate.

Consequence to accept explicitly: `studio-library` is permanent by design and will grow. No sweep will ever reclaim it. The org is on Supabase Pro (100 GB); current usage is ~416 MB.

That makes deletion the *only* way to reclaim bytes, and today deletion does not reclaim any: `DELETE /api/admin/studio/media` removes the bookkeeping row and leaves the storage object behind (`src/app/api/admin/studio/media/route.ts:92`), and folder deletion cascades the rows the same way. With no sweep touching this bucket, that combination would make every deleted clip a permanently unreachable, unbillable-to-nobody orphan.

So this work extends **both** delete paths. Row deletion remains the source of truth in each, and both still succeed if the object is already gone. Both are scoped to `studio-library` URLs, so existing `blog-*` behaviour is untouched.

**Single item** — `DELETE /api/admin/studio/media` (`media/route.ts:86-100`) currently deletes blind from `?id=` alone. It must `select url` for that id *before* deleting the row, then `storage.remove()` the object when the URL is a `studio-library` one.

**Whole folder** — `DELETE /api/admin/studio/folders` (`folders/route.ts:93-105`) leans on the `studio_media` FK cascade, so the rows disappear without anyone ever reading their URLs. That is the larger leak of the two: deleting one folder orphans every object it held. It must `select url from studio_media where folder_id = :id` first, `storage.remove()` the `studio-library` objects, and only then delete the folder (letting the cascade clear the rows).

Deleting many objects should be chunked, matching the existing `remove()` batching in `cleanup-worker.ts:255`.

Three details so this isn't re-derived:

- **URL → storage path.** `cleanup-worker.ts:19-25` already has `extractBucketFile(url, bucket)`, which splits on `/storage/v1/object/public/<bucket>/`. It is module-private; lift it to a shared helper rather than writing a second copy. Keep its `decodeURIComponent` handling (L219) — filenames are sanitized, but timestamps and extensions can still encode.
- **A failed `storage.remove()` is swallowed, not surfaced.** Row deletion is the source of truth; a user deleting a clip should not see an error because an object was already gone. Log it and continue.
- **Update the two route docblocks that will become false:** `folders/route.ts:9-10` ("Storage files are intentionally NOT removed") and `media/route.ts:14` ("the storage file remains").

### 2. Write path — device → folder

Ordering matters for perceived speed:

1. Files register to OPFS exactly as today (`MediaLibrary.tsx:50-74`), so editing starts immediately with no upload wait.
2. *Then* a compact "Save to library?" sheet appears: existing folders, "New folder", and "Skip".
3. If a folder is chosen, upload runs **in the background** while editing continues: `upload-sign` (destination `library`) → signed PUT → `POST /api/admin/studio/media` with `{ folderId, url, kind, filename, mime }`.

Each pool item shows its own save state. A failed upload offers retry and never disturbs the edit, because the local OPFS copy is what the timeline is using.

**On success, set `remoteUrl` on the existing asset without changing what the timeline is playing.** The playing source stays the local object URL — no hot-swap mid-edit, as decided. But recording `remoteUrl` closes a real durability hole: an `origin: 'opfs'` asset has bytes in one browser only, and reopening that project anywhere else throws "no local bytes and no remoteUrl" (`mediaStore.ts:58`). Saving to the library and still losing the project on another device would be an unpleasant surprise.

**Implementation note:** the sheet must retain the `File` objects itself. `importFiles` clears `fileRef.current.value` in its `finally` (`MediaLibrary.tsx:72`), so the input cannot be re-read when the user picks a folder.

"New folder" reuses `POST /api/admin/studio/folders`.

**Audio is excluded.** `importFiles` classifies audio (`MediaLibrary.tsx:56`; the input accepts `audio/*`), but the library cannot store it: `upload-sign` accepts only `'video' | 'image'`, the `/studio/media` POST rejects other kinds, and the `studio_media` CHECK constraint bars `'audio'`. Rule: audio files import to the project as they do today and are simply omitted from the save-to-library sheet. If every file in an import batch is audio, the sheet does not appear at all. Extending the library to audio is out of scope.

### 3. Read path — folder → Studio

`MediaPickerModal` gains three explicit additions:

**a. `kinds?: ('image' | 'video')[]`** — default `['image']`. Both existing call sites (`MediaFolders.tsx:277`, `src/app/admin/post/[id]/page.tsx:1978`) pass no filter, so the default leaves them bit-for-bit unchanged.

The picker's image-only assumption is spread wider than the two obvious gates, and one of the others is functional rather than cosmetic. All of these must become `kinds`-aware:

| Location | Today | Why it matters |
|---|---|---|
| L135, L265 | Selection + disabled state gated on `isImage` | The obvious gate; lifting it is what enables video selection |
| **L313-337** | **Selection badge rendered under `{isImage && …}`** | **Functional.** A selected video would show no check mark and no tap-order number — destroying the ordering affordance the entire read path depends on |
| L250-253 | Empty hint "Only videos here — carousel slides need pictures" | Wrong and confusing when video is selectable |
| L269 | Disabled tooltip "Videos can't be carousel slides" | Same |
| L349-351 | Footer copy "Tap pictures to select" / "N pictures selected" | Should read in terms of the allowed kinds |

The copy strings should be derived from `kinds` rather than hardcoded, so the carousel keeps its picture-specific wording and Studio gets neutral wording.

**b. A richer confirm payload.** Today `onConfirm` is `(urls: string[]) => void`, and selection state carries only `{ id, url }`. Studio needs `kind` (to build the `MediaAsset` and to probe correctly) and `filename` (for `MediaAsset.name`), so the picker must carry them through:

```ts
export interface PickedMedia { id: string; url: string; kind: 'image' | 'video'; filename: string | null }
```

To avoid touching the two carousel call sites, the existing `onConfirm: (urls: string[]) => …` stays exactly as-is, and a **separate optional** `onConfirmDetailed?: (picked: PickedMedia[]) => void | Promise<void>` is added. When present it takes precedence. Both preserve tap order. This keeps the carousel contract untouched rather than migrating two working call sites for no benefit.

**c. A second confirm action** — optional `secondaryLabel` + `onConfirmSecondary`, so Studio presents **Add to timeline** (primary) and **Add to pool** (secondary). The carousel supplies neither and renders exactly one button as today.

`MediaLibrary.tsx` gains a "Library" button beside Import that opens the picker.

On confirm, for each item **in tap order**:

1. `await probeMedia(url, kind)` for duration and dimensions.
2. Build a `MediaAsset` with `origin: 'upload'` and `remoteUrl`, mirroring `addPreset` (`MediaLibrary.tsx:21-37`).
3. `addMedia(asset)` — this is the "pool" (`project.media` via `projectStore.addMedia`).
4. For **Add to timeline** only, `addAssetToTimeline(asset)` (`clipFactory.ts:14-41`).

Ordering note: `addAssetToTimeline` is synchronous and returns a clip id. The ordering that matters is that `probeMedia` resolves *before* it, because clip duration is read off the probed asset (`clipFactory.ts:27`); and that items are processed one at a time so tap order becomes clip order.

`mediaStore` already fetches `remoteUrl` when it has no local bytes (`store/mediaStore.ts:52-58`), so playback needs no new plumbing.

### 3d. Cross-origin isolation (required, easy to miss)

`/admin/post/:id/studio` is the only route serving `Cross-Origin-Embedder-Policy: require-corp` (`next.config.mjs:107-111`), for the multithreaded FFmpeg.wasm core. Under `require-corp`, **no-cors element loads of cross-origin media are blocked.** The storage origin sends `Access-Control-Allow-Origin: *` but no `Cross-Origin-Resource-Policy` header, and Supabase CORS is project-wide, so this cannot be fixed by bucket configuration — it must be fixed at each element.

`mediaStore.resolve` is already safe (it fetches with `mode: 'cors'`, `mediaStore.ts:53`). Two things are not, and both are new exposure created by opening the picker from an isolated route:

1. **`MediaPickerModal` thumbnails** — `<img src={f.cover}>` (L230), `<img src={m.url}>` (L285) and `<video src={m.url}>` (L295) set no `crossOrigin`. They work today only because the picker is mounted on non-isolated routes. Opened from Studio, every thumbnail goes blank. Each needs `crossOrigin="anonymous"`.
2. **`probeMedia`'s image branch** (`blobStore.ts:77-82`) never sets `img.crossOrigin`, unlike the video branch which does (L88). Read-path step 1 is the codebase's first remote-image probe and would reject under COEP, so image clips would fail to size. Needs the same one-line fix.

These are small but load-bearing: without them the feature appears broken on the exact screen it was built for.

Adding `crossOrigin="anonymous"` also affects the two existing carousel call sites, which are not isolated. That is safe — storage sends `ACAO: *`, and `VideoEditor.tsx:247` already loads storage media this way — but the manual checklist includes one carousel-route render so a silent regression there would be caught.

**HEIC probing:** the bucket accepts `image/heic`, but `probeMedia`'s image branch cannot decode a true `.heic` on Chrome or Firefox. iOS Safari normally transcodes on pick, so the real path is fine; where it isn't, a probe failure falls back to zero dimensions exactly as `importFiles` already tolerates, rather than failing the import.

Update `MediaPickerModal`'s file docblock (L4-17), which currently states image-only and "Videos can't be carousel slides."

## Testing

Unit tests:

- `upload-sign` bucket routing for each `destination` value, including the default and an invalid value.
- The kind-filtering predicate (selectable vs disabled) in the picker, including the `['image']` default that protects the carousel.
- Library item → `MediaAsset` mapping.
- The audio-exclusion rule: a mixed batch offers only its image/video files; an all-audio batch shows no sheet.
- `onConfirmDetailed` takes precedence over `onConfirm` when both are supplied.
- Tap order survives navigating between folders with mixed kinds selected.
- The `studio-library`-scoped storage delete, for both paths: a `studio-library` URL removes the object, a `blog-*` URL does not, and row deletion still succeeds when the object is already missing.
- Folder delete collects every child URL *before* the cascade removes the rows.

Manual checks that unit tests cannot cover:

- On the isolated Studio route: picker thumbnails (image, video, folder cover) actually render. The COEP regression is invisible to jsdom.
- On the isolated Studio route: export still succeeds with a library-sourced clip on the timeline.
- On a carousel (non-isolated) route: thumbnails still render after the `crossOrigin` change.

Manual verification in a real browser at 390px width, since Studio-on-phone is the actual use case. Per the existing Studio testing notes: grant the dev user the temp `studio` permission and revert it afterwards, and never export-test against a live post.

## Risks

| Risk | Mitigation |
|---|---|
| A future recursive cleanup sweep deletes the library | Separate bucket the sweep never touches, rather than relying on the accidental `manual-uploads/` prefix exemption |
| Picker thumbnails blank / image probe fails under Studio's COEP | `crossOrigin="anonymous"` on the picker's img/video elements and on `probeMedia`'s image branch; verified manually on the isolated route |
| HEIC phone photos rejected by the bucket | MIME allowlist is the union of the live `blog-images` / `blog-videos` lists |
| Deleted library media leaks storage forever | Both the item and folder DELETE paths remove `studio-library` objects; the folder path reads child URLs before the cascade |
| Project unopenable on another device | `remoteUrl` recorded on the asset after a successful save |
| Background upload fails silently | Per-item save state + retry; edit is never blocked |
| Carousel flow regresses | `kinds` defaults to `['image']`; carousel call site unchanged |
| Storage grows unbounded | Accepted and documented; pruning is manual on the Media page |
| Large mobile uploads feel slow | Upload is backgrounded and skippable |

## Out of scope

- Series metadata (`series`, `episode_number`) — sub-project B.
- The interactive reorderable Top 10 page — sub-project C.
- Migrating existing media (there is none).
- Changing Studio export behaviour.
- Making the cleanup worker's bucket listing recursive, or otherwise altering the sweep.
- Storing audio in the media library.
