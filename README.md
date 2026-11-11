# Frameforge Studio

A local-first video editor built with React, TypeScript, and Vite. It provides a functional browser editing workflow: import local video, image, and audio files, SVG artwork, SRT subtitles, and local fonts; arrange and trim clips on separate tracks; preview color filters, clip transitions, and titles; autosave projects locally; and render a downloadable WebM composition in browsers with MediaRecorder support.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To create and serve a production build:

```sh
npm run build
npm run preview
```

## Deploy to Firebase Hosting

The Firebase Hosting project is `miss-tshinyelani`. Sign in with the Firebase CLI account that has access to this project, then run:

```sh
npm run deploy
```

The deploy command builds the Vite app and publishes `dist/` with SPA fallback routing. Firebase Hosting serves the app at `https://miss-tshinyelani.web.app` and `https://miss-tshinyelani.firebaseapp.com` after a successful deployment. Configure any custom domain separately in the Firebase console; no custom domain is configured by this project.

## Editing workflow

1. Create a project and import video, audio, image, SVG, SRT, or font files. Files can also be dropped anywhere in the editor. Search, duplicate, delete, and reopen local projects from the dashboard; rename a project from its title field in the editor.
2. Double-click an item or use its plus button to add it to a timeline track. Use the layered button on a video or image asset, or drag it onto the PIP Overlay lanes, to create as many independently stacked overlays as needed above the Video lane. Overlays start at the playhead as a smaller upper-right picture-in-picture; video overlays play in sync with the main video. Adjust overlay position, size, opacity, and source-audio mute in the Inspector. Right-click an overlay clip to bring it forward or send it backward. Click the timeline ruler or an empty lane to seek; seeking while playing continues playback from the clicked time. Use the timeline zoom slider or buttons to zoom from 11% to 1000%. Audio clips can overlap on the Audio lane and are mixed together. Drag clips to reposition them, and drag their edges to trim. Right-click a clip for copy, cut, paste, duplicate, split, move-to-overlay, and delete actions; right-click an empty lane to paste at that time or add the selected media. Shortcuts: Space to play/pause, S to split, Delete/Backspace to remove, Ctrl/Cmd+C/X/V to copy/cut/paste timeline clips, Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z to redo, and Ctrl/Cmd+S to save.
3. Use the playhead and preview controls to review the edit. Add a title from the Text panel and change its text, color, font, and size in the Inspector. Import `.srt` files to add subtitle clips at their cue timings, `.svg` artwork as scalable images, and `.ttf`, `.otf`, `.woff`, or `.woff2` font files for titles.
4. In Filters, search and browse 40+ built-in looks across 19 categories, illustrated with original offline-ready vector cover art. Apply one or more to the project or to selected clips (Ctrl/Cmd-click timeline clips for multi-select); adjust intensity and color controls, toggle/reorder/remove stack entries, compare the original, copy/paste a stack, favorite looks, and save named custom presets. Filter configuration is saved with the project and used by both the preview and browser canvas export.
5. In Transitions, click a preset for the selected incoming video/overlay clip or drag it onto the relevant cut. The library includes 30+ original transitions across 14 categories, with illustrated covers and transition-specific visual treatments. Adjust duration, direction, and intensity where relevant; remove or replace the transition from the panel. Supported transitions are rendered in the preview and canvas export. Separate audio timeline clips continue uninterrupted; source-video audio is not extracted or transitioned.
6. Export to WebM. The browser renders the timeline, visible image/video layers, title layers, filters, transitions, and audio clips to a canvas recording. Rendering runs in real time; keep the tab open until the download starts.
7. Projects autosave to IndexedDB. Use the download icon in the Inspector to export a portable `.frameforge.json` backup that embeds imported media and fonts, and use **Import project** on the home screen to restore it.

## Additional timeline tools

- Toggle magnetic snapping from the timeline toolbar to align clip edges with other clips or the playhead.
- Ripple delete removes selected clips and closes the resulting gaps on those same tracks/layers; split all cuts every clip crossing the playhead.
- Add named markers at the playhead, click a marker to jump to it, double-click to rename it, and right-click to remove it. Use the marker navigation buttons to move between markers.
- Use **Trim start here** or **Trim end here** in the Inspector to trim the selected clip at the playhead. Track eye/audio controls hide video, overlay, or text layers and mute the audio lane in both preview and export.
- Loop playback repeats the project from the start. **Fit timeline** adjusts the zoom to show the full edit, and the help button (or `?`) opens the keyboard-shortcut reference.
- Shortcuts: `M` adds a marker, `[` / `]` navigates markers, and `L` toggles loop playback.

## Current processing and storage limits

- Export is a real browser canvas + `MediaRecorder` render and currently produces WebM only. Encoder/codec availability depends on the browser. It renders at real time, so long edits take time; 4K output may exceed available memory. The export dialog offers 480p, 720p, 1080p, and 4K output, the project aspect ratio, 24/25/30/50/60 FPS, four quality presets, and audio bitrate choices.
- Video and image layers (including unlimited independently stacked overlays with adjustable position, size, and opacity), title overlays, editable filter stacks, supported incoming transitions, and overlapping timeline audio are rendered. The WebM canvas renderer uses the same layer order, layout, filter parameters, and transition definitions as the preview; high-resolution multi-layer effects can be CPU-intensive. Transitions apply on a clip's entrance and do not overlap or retime audio. Keyframe animation, video stabilization, chroma key, extracted source-video audio, `.cube` LUT processing, and arbitrary FFmpeg filter graphs are not implemented.
- Resolution increases are ordinary resampling, not AI enhancement, and cannot reliably restore details that were never captured. No AI model or speech-to-text service is configured.
- Projects and imported source blobs are stored in the current browser profile using IndexedDB. Browser storage can be cleared, quota-limited, or unavailable in private browsing. Export a portable project backup regularly; the embedded media increases its size.
- File import is limited to browser-decodable media and files up to 1 GB. MKV video is converted locally to H.264/AAC MP4 with FFmpeg WebAssembly when the browser cannot read it; this can take time and uses substantial memory. Other unsupported video files should be converted to MP4 (H.264) or WebM before import. SVGs are loaded as image assets; SRT cues become editable title/subtitle clips; local fonts are stored with the project. Only import font files you have permission to use. The original files on disk are never modified.

## Architecture

- `src/types.ts` — project, asset, filter, transition, preset, and effect-pack types; built-in library and shared preview/export effect render helpers.
- `src/effect-packs.ts` — strict data-only effect-pack validation.
- `src/storage.ts` — IndexedDB project persistence.
- `src/App.tsx` — editor, playback, timeline operations, import, project backup, and browser export.
- `src/styles.css` — dark responsive editor interface.
- `tests/effects.test.mjs` — built-in library, preview/export mapping, effect-pack validation, and project serialization tests (`npm test`; Node.js 22+).

FFmpeg.wasm is bundled for local MKV-to-MP4 import conversion. The bundled `@ffmpeg/core` binary is licensed under GPL-2.0-or-later; observe its license and source-distribution requirements when redistributing this application. Video export still uses the browser's native recorder.

## Effect packs and third-party assets

The versioned, JSON-only pack format uses `format: "frameforge-effect-pack"` and `schemaVersion: 1`. Packs carry an ID/version, descriptive and license metadata, compatible application version, required-asset descriptors, and optional filter/transition definitions. Imported filter settings are validated for category, supported parameter names/ranges, and finite numeric values. Imported transitions must use a built-in rendering primitive; no pack JavaScript is loaded or executed. Pack JSON is limited to 10 MB and installed pack references are preserved in project saves and portable project backups. Removing a pack does not silently delete effect settings; the editor warns about missing pack references.

Minimal data shape (a filter definition must include every parameter shown):

```json
{
  "format": "frameforge-effect-pack",
  "schemaVersion": 1,
  "id": "studio.example-look",
  "version": "1.0.0",
  "name": "Example Look",
  "description": "A user-provided color look",
  "thumbnail": "https://example.invalid/preview.png",
  "author": "Your name",
  "license": "SPDX identifier or full license terms",
  "compatibleAppVersion": "1.0.0",
  "requiredAssets": [],
  "filters": [{
    "id": "example-look",
    "name": "Example Look",
    "description": "A data-only filter preset",
    "category": "Custom User Presets",
    "parameters": {
      "brightness": 100, "contrast": 110, "saturation": 100, "exposure": 0,
      "temperature": 0, "tint": 0, "highlights": 0, "shadows": 0,
      "fade": 0, "vignette": 0, "grain": 0, "sepia": 0, "grayscale": 0, "hue": 0
    }
  }]
}
```

There is no configured online pack catalog or automatic third-party download service. The editor links to Mixkit, Pixabay, ProductionCrate, and GitHub search so users can review the original terms and obtain assets directly. Video, image, and audio files can be imported through the existing media importer, but each item's license and redistribution rights remain the user's responsibility. Pack asset descriptors are metadata/references, not an asset downloader. LUT (`.cube`) ingestion, overlay/audio assets installed directly from packs, and remotely downloadable packs are not available yet; do not treat those features as supported.
