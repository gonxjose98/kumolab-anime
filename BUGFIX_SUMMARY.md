# Kumolab Blog Card Image Bug Fix

## Problem Summary
When editing posts in Mission Control, text overlay toggles (text/gradient/watermark) were not persisting to the blog card after saving. The preview showed correctly, but the saved blog card didn't reflect the processed image with text.

## Root Cause
The bug was in `src/app/api/admin/custom-post/route.ts`. When saving a post:

1. The client (PostManager.tsx) would:
   - Generate a processed image with text overlays via `handleApplyText()`
   - Send the processed image to the API with `skipProcessing: 'true'`
   - Include `imageSettings` JSON with the toggle states

2. The API would:
   - See `skipProcessing === 'true'`
   - Simply move the **raw uploaded temp file** to permanent storage
   - **IGNORE** the `imageSettings` that indicated text overlays were enabled
   - **NOT** process the image through `generateIntelImage()`

This meant the processed image with text overlays was discarded, and the raw unprocessed image was saved instead.

## Fixes Applied

### 1. Fixed `src/app/api/admin/custom-post/route.ts`
**Change:** Modified the image handling logic to check `imageSettings` for overlay toggles and process the image when needed, regardless of the `skipProcessing` flag.

**Key changes:**
- Parse `imageSettings` from the form data
- Check if `isApplyText`, `isApplyGradient`, or `isApplyWatermark` are enabled
- If overlays are enabled, ALWAYS process the image through `generateIntelImage()`
- Only skip processing when no overlays are requested
- Pass all the image settings (textScale, gradientPosition, etc.) to `generateIntelImage()`

### 2. Fixed `src/lib/engine/image-processor.ts`
**Change 1:** Fixed undefined variable `derivedClassification` → changed to `classification` (the actual parameter name)

**Change 2:** Simplified error handling in catch block to prevent undefined variable access

## Data Flow After Fix

```
User toggles text ON in editor
        ↓
PostManager.tsx sends to /api/admin/custom-post:
  - image: processed image blob
  - imageSettings: { isApplyText: true, isApplyGradient: true, ... }
  - skipProcessing: 'true'
        ↓
API route.ts:
  - Parses imageSettings
  - Sees isApplyText: true → forces processing
  - Calls generateIntelImage() with all settings
  - Returns processed image URL with text overlays
        ↓
Database stores image with text baked in
        ↓
BlogCard.tsx displays post.image with text overlays ✓
```

## Testing Verification
To verify the fix works:

1. Open Mission Control
2. Edit an existing post or create a new one
3. Toggle "Text" ON and enter headline text
4. Toggle "Gradient" ON
5. Toggle "Watermark" ON (optional)
6. Click "Show Preview" to verify overlays appear
7. Click "Save Changes"
8. Navigate to the blog feed
9. **Expected:** The blog card shows the image WITH text/gradient/watermark overlays
10. **Before fix:** The blog card showed the raw image WITHOUT overlays

## Files Modified
- `src/app/api/admin/custom-post/route.ts` - Core fix for image processing logic
- `src/lib/engine/image-processor.ts` - Fixed undefined variable reference

## Additional Bug Fixed
The `derivedClassification` variable was referenced but never defined in `image-processor.ts`. This was changed to use the `classification` parameter that was already being passed to the function.
