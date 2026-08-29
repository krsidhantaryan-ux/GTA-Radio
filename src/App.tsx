import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { stations } from './stations';
import { useRadioStore } from './store';
import { RadioEngine } from './audio/RadioEngine';
import { displayTrackName, importFiles } from './importer';
import type { LocalTrack } from './types';

type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };

async function filesFromDirectory(handle: FileSystemDirectoryHandle) {
  const result: File[] = [];
  async function walk(directory: FileSystemDirectoryHandle) {
    for await (const entry of directory.values()) {
      if (entry.kind === 'file') result.push(await entry.getFile());
      else await walk(entry);
    }
  }
  await walk(handle);
  return result;
}

export function App() {
  const { selected, tracks, status, select, setTracks, setPlaying } = useRadioStore();
  const [trackName, setTrackName] = useState('Choose a local radio folder');
  const [toast, setToast] = useState('');
  const [tuning, setTuning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = useMemo(() => new RadioEngine(), []);
  const station = stations[selected];
  const leftStation = stations[(selected - 1 + stations.length) % stations.length];
  const rightStation = stations[(selected + 1) % stations.length];
  const rotation = -(360 / stations.length) * selected;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(current => current === message ? '' : current), 2400);
  }, []);

  const changeStation = useCallback((next: number) => {
    select(next, stations.length);
    setTuning(false);
    requestAnimationFrame(() => setTuning(true));
  }, [select]);

  const activate = useCallback(async () => {
    const current = stations[useRadioStore.getState().selected];
    if (current.id === 'off') {
      engine.stop(); setPlaying(undefined); setTrackName('Radio Off'); return;
    }
    const available = useRadioStore.getState().tracks.get(current.id);
    if (!available?.length) { notify(`No audio matched “${current.name}”`); return; }
    const track: LocalTrack = available[0];
    // A stable epoch makes a long broadcast feel live when the listener tunes back in.
    const liveOffset = Math.floor(Date.now() / 1000);
    try {
      await engine.tune(track, liveOffset);
      setPlaying(current.id);
      setTrackName(displayTrackName(track.name));
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: displayTrackName(track.name), artist: current.name, album: 'Los Santos Radio' });
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not play this file'); }
  }, [engine, notify, setPlaying]);

  useEffect(() => { engine.onEnded(() => void activate()); return () => engine.destroy(); }, [activate, engine]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = useRadioStore.getState().selected;
      if (['ArrowRight', 'ArrowDown', 'd', 'D'].includes(event.key)) { event.preventDefault(); changeStation(current + 1); }
      if (['ArrowLeft', 'ArrowUp', 'a', 'A'].includes(event.key)) { event.preventDefault(); changeStation(current - 1); }
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); void activate(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate, changeStation]);

  const processFiles = async (files: File[]) => {
    const imported = await importFiles(files);
    setTracks(imported.tracks, imported.matched);
    notify(imported.matched ? 'Local radio library ready' : 'No files matched station names');
  };

  const chooseFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) { inputRef.current?.click(); return; }
    try { await processFiles(await filesFromDirectory(await picker())); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') inputRef.current?.click(); }
  };

  return <main className="radio-app">
    <header className="topbar">
      <div className="brand"><strong>Los Santos</strong><span>Radio selector</span></div>
      <button className="library-button" onClick={() => void chooseFolder()}>Choose radio folder</button>
      <input ref={inputRef} type="file" multiple accept="audio/*" hidden
        {...({ webkitdirectory: '' } as object)}
        onChange={event => void processFiles(Array.from(event.target.files ?? []))} />
    </header>
    <section className="wheel-wrap" aria-label="Radio stations">
      <motion.div className="wheel" animate={{ rotate: rotation }} transition={{ type: 'spring', stiffness: 170, damping: 24 }}>
        {stations.map((item, index) => {
          const angle = (360 / stations.length) * index;
          return <button key={item.id} aria-label={item.name}
            className={`station ${item.logo ? 'has-logo' : 'text-logo'} ${item.id === 'off' ? 'off' : ''} ${index === selected ? 'selected' : ''}`}
            style={{ '--angle': `${angle}deg`, '--station-color': item.color } as React.CSSProperties}
            onClick={() => { changeStation(index); window.setTimeout(() => void activate(), 0); }}>
            <motion.span className="station-inner" animate={{ rotate: -rotation }} transition={{ type: 'spring', stiffness: 170, damping: 24 }}>
              {item.logo
                ? <img className="station-logo" src={item.logo} alt="" draggable={false} />
                : <span className="station-mark">{item.mark}</span>}
            </motion.span>
          </button>;
        })}
      </motion.div>
      <div className="now-playing" aria-live="polite">
        <h1>{station.name}</h1>
        <p className="track">{station.id === 'off' ? 'Radio Off' : tracks.get(station.id)?.length ? trackName : 'No local audio found'}</p>
        <p className="artist">{station.genre}</p>
        <p className="hint direction-hint">
          <span className="direction"><span className="key">A</span>{leftStation.short}</span>
          <span className="direction"><span className="key">D</span>{rightStation.short}</span>
        </p>
      </div>
    </section>
    <div className={`status ${tracks.size ? 'ready' : ''}`}>{status}</div>
    <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    <div className={`tuning ${tuning ? 'flash' : ''}`} onAnimationEnd={() => setTuning(false)} />
  </main>;
}
