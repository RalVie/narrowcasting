# Narrowcasting Testing Documentation

This folder is reserved for testing and verification documentation.

Future documents may include:

- manual verification procedures;
- regression test plans;
- acceptance criteria;
- Raspberry Pi verification checklists;
- release validation.

Testing documentation should verify behaviour defined by the Product Specification and boundaries defined by the Architecture.

## Raspberry Pi Video Compatibility Stabilization

If a mixed image/video playlist becomes unstable and Chromium hangs before `canplay`, verify the video file with a Raspberry Pi Chromium-safe transcode before investigating scheduling or runtime architecture.

Target format:

- MP4 container
- H.264 video
- `yuv420p` pixel format
- AAC audio, or no audio
- `faststart` enabled
- reasonable bitrate and resolution

Recommended `ffmpeg` command:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -preset medium -crf 23 -maxrate 8000k -bufsize 16000k \
  -vf "scale='min(1920,iw)':-2" \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart \
  output-pi-safe.mp4
```

For a silent video:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -preset medium -crf 23 -maxrate 8000k -bufsize 16000k \
  -vf "scale='min(1920,iw)':-2" \
  -an \
  -movflags +faststart \
  output-pi-safe.mp4
```

Test procedure:

1. Re-encode the problematic video.
2. Upload the re-encoded file as a new Media item.
3. Replace the original video in the test playlist.
4. Run the mixed image/image/video playlist for at least 20 loops.
5. Confirm Chromium reaches `canplay`, the video plays each loop, and the playlist does not restart unexpectedly.
