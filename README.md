# Los Santos Radio Wheel

A local-first, game-inspired radio selector built with React, TypeScript, Vite, Zustand, Framer Motion, Dexie/IndexedDB, the File System Access API, and Web Audio. The app never uploads your audio: choose a folder in the browser and files are played through local object URLs.

The two-channel audio engine supports smooth crossfades and deterministic live-style offsets. IndexedDB stores lightweight library metadata only; the recordings remain on your disk.

## Run locally

```bash
npm install
npm run dev
```

Open the displayed local URL in Chrome or Edge, choose your radio library folder, and select a station.

## Organize audio

Use one folder per station. Folder names are matched loosely, so names such as `Radio Los Santos`, `Non Stop Pop FM`, `West Coast Classics`, and `The Lowdown` work.

```text
GTA-Radio-Audio/
  Radio Los Santos/
    001 - track.mp3
  West Coast Classics/
    broadcast.mp3
```

Supported browser formats include MP3, WAV, OGG, M4A/AAC, FLAC, Opus, and WebM. Game-native formats such as AWC and WEM must be converted to a browser-supported format first.

Large local media belongs outside this repository. `public/local-radio`, `public/local-assets`, AWC, and WEM files are ignored by Git.

## Controls

- **Left / Right**, **A / D**, or mouse wheel: browse stations
- **Enter / Space**, or click a station: play
- **Choose radio folder**: load local files without uploading them
