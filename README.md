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

## Broadcast scheduler & ad breaks

The **Scheduler** panel (top-right) inserts authentic-feeling commercial breaks
between songs without ever uploading audio.

- **Song timestamps** are bundled from
  [`jtaomas/GTA-V-Radio`](https://github.com/jtaomas/GTA-V-Radio) (MIT licensed).
  You can also import your own `radiostations.json` with **Import JSON**.
- **Commercials**: pick your `GTA V Radio Commercials.mp3` recording. The app
  detects individual spots automatically by finding the silence gaps between
  them (or you can press **Edit ranges** to define them by hand).
- Toggle **Insert ad breaks at song boundaries** to switch it on.

How a break works:

1. The scheduler matches metadata stations to your local filenames.
2. It validates each schedule's duration against the real MP3 before planning.
3. Just before a song ends it fades the music out at that exact boundary.
4. A randomly chosen advertisement range plays (the last few spots aren't
   repeated).
5. The station timeline resumes with a short crossfade at the position it would
   have reached — so the station clock keeps running through the commercial.

If the metadata doesn't line up with a file (a per-song folder, a different rip,
or a station with no timestamps) the scheduler falls back to uninterrupted
playback.

To make scheduling work, a station needs **one full broadcast recording** whose
length matches the metadata (e.g. `broadcast.mp3`), not a collection of
individual songs.

## Controls

- **Left / Right**, **A / D**, or mouse wheel: browse stations
- **Enter / Space**, or click a station: play
- **Choose radio folder**: load local files without uploading them
- **Scheduler** (top-right): load commercials + timestamps and toggle ad breaks
