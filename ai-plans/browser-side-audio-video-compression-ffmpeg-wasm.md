# Browser-Side Audio/Video Compression With ffmpeg.wasm

## Summary

Add optional client-side compression for audio/video before ImageKit upload, using `ffmpeg.wasm` only when needed. Images keep the existing `browser-image-compression` path. Audio/video compression runs after file validation and before `uploadMedia`, with progress, cancellation, fallback to original, and saved-size metadata.

## Key Changes

- Add `@ffmpeg/ffmpeg` and `@ffmpeg/util` as lazy-loaded dependencies.
- Add a new compression service, for example `src/services/mediaCompression.js`, responsible for:
  - Detecting whether audio/video should be compressed.
  - Loading FFmpeg only on demand.
  - Running compression presets.
  - Reporting progress and allowing cancellation.
  - Returning either a compressed `File` or the original file with a reason.
- Update `uploadMedia` flow:
  - Keep validation limit at 100 MB for source audio/video.
  - For images, keep current image compression logic unchanged.
  - For audio/video, call the compression service before requesting ImageKit upload auth.
  - Upload the compressed file only if it is at least 10% smaller than the original; otherwise upload the original.
- Store compression metadata on uploaded media:
  - `compressed: boolean`
  - `originalName`
  - `originalSize`
  - `compressionSkippedReason?: 'small_file' | 'not_smaller' | 'failed' | 'cancelled' | 'unsupported'`
  - `compressionOutputSize?: number`
  - `compressionPreset?: 'audio-standard' | 'video-720p'`
- Update Editor UI:
  - Show distinct phases: preparing, compressing, uploading.
  - Show compression progress separately from upload progress.
  - Add cancel support during compression.
  - If compression fails, continue with original upload and show a non-blocking localized warning.
- Add i18n keys in English and Ukrainian for compression status, cancellation, fallback, and saved-size messaging.

## Compression Rules

- Audio:
  - Compress if file is larger than 5 MB.
  - Output container: `.m4a`.
  - Codec/bitrate: AAC at 128 kbps.
  - FFmpeg command shape:
    - `-i input -vn -c:a aac -b:a 128k output.m4a`
- Video:
  - Compress if file is larger than 20 MB.
  - Output container: `.mp4`.
  - Max resolution: 720p, preserving aspect ratio and never upscaling.
  - Codec/bitrate: H.264 at around 2 Mbps, AAC audio at 128 kbps.
  - FFmpeg command shape:
    - `-i input -vf scale='min(1280,iw)':-2 -c:v libx264 -preset veryfast -b:v 2000k -c:a aac -b:a 128k output.mp4`
- Keep original file when:
  - File is below threshold.
  - Compression fails.
  - User cancels.
  - Compressed file is not at least 10% smaller.
  - FFmpeg cannot load in the current browser.

## Implementation Details

- Keep compression out of the game runtime path; it only runs in Question Pack Editor before upload.
- Do not preload or initialize FFmpeg at app startup.
- Use one shared FFmpeg instance per browser tab and serialize compression jobs to avoid memory spikes.
- For cancellation:
  - Expose an `AbortController`-style API from the compression service.
  - On cancel, terminate/reset the FFmpeg instance if needed, restore previous editor media state, and clear progress.
- For progress:
  - Map FFmpeg progress to a `compressionProgress` state.
  - Keep existing ImageKit upload `mediaProgress` for upload progress.
  - Editor action lock should remain active while either compression or upload is running.
- For file naming:
  - Preserve the original base name and replace extension with `.m4a` or `.mp4`.
  - Upload metadata should keep `originalName` and `originalSize`.

## Test Plan

- Run `npm run lint` and `npm run build`.
- Audio:
  - Small audio under 5 MB skips compression.
  - Large audio compresses to `.m4a`.
  - Original uploads if compressed result is not smaller by at least 10%.
- Video:
  - Small video under 20 MB skips compression.
  - Large video compresses to 720p `.mp4`.
  - Portrait and landscape videos preserve aspect ratio.
- Failure paths:
  - FFmpeg load failure falls back to original upload.
  - Compression error falls back to original upload.
  - Cancel stops compression and leaves the previous attachment unchanged.
- UI:
  - Compression progress appears before upload progress.
  - Upload buttons are disabled during compression/upload.
  - All new strings exist in both English and Ukrainian dictionaries.

## Assumptions

- Compression is optional optimization, not a hard requirement for upload.
- The 100 MB source upload limit remains unchanged.
- The first implementation uses single-threaded `ffmpeg.wasm` to avoid requiring cross-origin isolation headers.
- Multi-threaded FFmpeg and WebCodecs are future optimizations, not part of this implementation.
