-- studio-library storage bucket
--
-- Curated media the operator files into folders, as opposed to the transient
-- post footage in blog-videos. It exists as a SEPARATE bucket specifically so
-- the cleanup worker's slim sweep can never reach it: that sweep is scoped to
-- VIDEO_BUCKET = 'blog-videos' (src/lib/engine/cleanup-worker.ts), builds its
-- keep-set only from posts.social_ids, and would classify a library clip as an
-- orphan. Library media survives in blog-videos today only because the sweep's
-- storage list('') is non-recursive and uploads sit under a path prefix — an
-- accidental exemption that a future refactor could remove.
--
-- Consequence, accepted deliberately: nothing ever auto-prunes this bucket.
-- Reclaiming bytes is the delete paths' job (see the studio media/folders
-- routes, which remove the object alongside the row).
--
-- allowed_mime_types is the union of the live blog-images and blog-videos
-- lists. image/heic + image/heif are load-bearing: HEIC is the iPhone camera's
-- default photo format, and omitting it fails a phone save at the storage
-- layer with an opaque signed-PUT error.
--
-- file_size_limit matches blog-videos (100 MB). The signed PUT is a single
-- non-resumable request, so a failed upload retries the whole file; a larger
-- cap makes a cellular failure more expensive, not more capable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'studio-library',
    'studio-library',
    true,
    104857600,
    array[
        'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
        'image/heic', 'image/heif',
        'video/mp4', 'video/webm', 'video/quicktime',
        'video/x-m4v', 'video/3gpp', 'video/mpeg'
    ]
)
on conflict (id) do nothing;
