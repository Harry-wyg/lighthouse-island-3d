# 灯塔岛 · 七日漂流（3D 版）

An MBTI test built as a 3D adventure game. Over seven days on a desert island, the player's scene choices, mini-game behavior and how they explore are turned into a score for each of the four dimensions.

## Online demo / GitHub Pages

[Play 灯塔岛 · 七日漂流](https://harry-wyg.github.io/lighthouse-island-3d/)

The GitHub Pages demo runs entirely in your browser with local saves, local scoring and downloadable share posters. Images and videos load from Cloudinary. Cloud saves, shared result links, feedback collection and the admin dashboard require the Node server and are unavailable in the Pages demo.

Every push to `main` deploys the browser app through `.github/workflows/pages.yml`. In repository Settings → Pages, select **GitHub Actions** as the source. Run `npm run build:pages` locally to generate `dist/`; the build excludes the server, admin page, player data and original media. It works under the repository URL prefix and on custom domains.

Runtime data, credentials, production manifests and original media are ignored by Git. Keep your local copies for backup.

## Running it

```bash
cd lighthouse-island-3d
node server.js            # Node.js ≥ 18, no dependencies
# Game:  http://localhost:5173
# Admin: http://localhost:5173/admin.html?token=island-admin
```

Environment variables: `PORT` (default 5173) and `ADMIN_TOKEN` (default `island-admin`; change it before going live). Data is stored in `data/db.json`.

Devices without WebGL are redirected to `lite.html`, the 2D version.

## Structure

```
server.js              Static files + REST API (anonymous accounts, cloud saves, server-side scoring, sharing, calibration feedback, analytics, admin)
public/
  index.html           Entry point (importmap → vendor/three.module.min.js r160)
  admin.html           Admin dashboard: funnel, type distribution, calibration accuracy, hot-updated signal weights
  lite.html            2D fallback version
  css/style.css
  js/
    main.js            Boot flow, title screen, resume from save, ending
    world.js           Three.js scene: terrain/ocean/sky/vegetation, time of day and weather, camera, input, interactables, zones
    characters.js      Procedural low-poly characters and 20+ animations, expressions, emotes
    story.js           Prologue + 7 days + dream tiebreak + lighting cutscene (main quests, side quests, hidden quest)
    minigames.js       11 mini-games (hut search, gear puzzle, water rationing, planning board, packing, drumming, cooking, storm runner, assembly…)
    ui.js              Dialog, choices, HUD, quest tracker, journal, bag, settings
    game.js            State, signal recording, quests, affinity, achievements, collections, stamina, saves, API
    result.js          Result page, share poster, calibration feedback
    audio.js           Synthesized in real time with WebAudio (generative BGM / ambience / SFX), no audio files
    score.js           Scoring model shared by front end and server
    assets.js          Image/video slots
  assets/              54 generated images; opening video in landscape + vertical, hidden ending in vertical only (see assets/README.md)
  assets-preview.html  Visual review of all image/video slots
scripts/
  image-production.json  Image prompts, reference images and original output paths
  check-assets.mjs       Verify dimensions, codecs, transparency and video duration (ffmpeg/ffprobe required)
```

All 54 image assets are installed and validated. Open `http://localhost:5173/assets-preview.html` to review them. Run `npm run assets:check -- --images` to validate images, or `npm run assets:check` to require both videos as well. The opening has landscape and vertical versions; the hidden ending is vertical only (desktop plays it centered too). Uncompressed originals are in `video-src/`.

## Debugging

- Opening `?debug` exposes `window.__island` (W / G / quests / triggerInteract) for automated tests.
- `?r=<resultId>` opens someone else's shared result page.

## CDN

All images and videos are hosted on Cloudinary, and the links are written directly in `public/js/assets.js` (the list is in `scripts/cloudinary-urls.csv`). `public/assets/` keeps only the source files and can be left out when deploying. `npm run assets:check` downloads each asset from the CDN and validates it.
