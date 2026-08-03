# Login Background Video Setup

## How to Add Your Video

1. **Prepare your video file:**
   - Format: MP4 (recommended for best browser compatibility)
   - Resolution: 1920x1080 or higher
   - Duration: Ideally 10-30 seconds (will loop)
   - File size: Keep under 50MB for optimal performance
   - Codec: H.264 video, AAC audio

2. **Place the video file:**
   - Copy your video file to this directory: `frontend/public/videos/`
   - Rename it to: `login-bg.mp4`

3. **Video appears in:**
   - Login page background at `http://localhost:5173/login`

## Video Recommendations

- **Dimensions:** 16:9 aspect ratio (1920x1080, 1280x720, etc.)
- **Style:** Manufacturing/tech theme works best with X-Lerate branding
- **Lighting:** Dark to medium tones for text readability (or add overlay)
- **Motion:** Subtle, non-distracting motion recommended
- **Audio:** Muted (autoplay="muted" is set)

## Compression Tips (using FFmpeg)

```bash
# Compress video while maintaining quality
ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 23 -c:a aac -b:a 128k login-bg.mp4

# For better quality (larger file)
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k login-bg.mp4

# Convert from other formats (e.g., MOV to MP4)
ffmpeg -i input.mov -c:v libx264 -crf 23 -c:a aac -b:a 128k login-bg.mp4
```

## Fallback

If the video fails to load, a dark overlay with gradient will display instead.
