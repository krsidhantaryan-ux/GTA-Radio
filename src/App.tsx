import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { stations } from './stations';
import { useRadioStore } from './store';
import { RadioEngine } from './audio/RadioEngine';
import { displayTrackName, importFiles } from './importer';
import { BroadcastScheduler } from './radio/scheduler';
import { DEFAULT_SCHEDULER_OPTIONS } from './radio/types';
import { buildCommercialCueSheet, getDefaultSchedules } from './radio/library';
import { importRadioMetadata } from './radio/metadata';
import { parseDefinedRanges } from './radio/commercials';
import { loadSchedulerEntries, saveSchedulerEntry, saveSetting, loadSetting } from './db';
import type { CueSheet, StationSchedule } from './radio/types';
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

/** Merge default bundled timestamps with any user-imported ones (user wins). */
function mergeSchedules(defaults: StationSchedule[], persisted: StationSchedule[]): StationSchedule[] {
  const map = new Map<string, StationSchedule>();
  for (const schedule of [...defaults, ...persisted]) map.set(schedule.stationId, schedule);
  return Array.from(map.values());
}

export function App() {
  const {
    selected, tracks, status, select, setTracks, setPlaying,
    schedules, cue, advertising, commercialsName, scheduleStatus,
    setSchedules, setCue, setAdvertising, setScheduleStatus,
  } = useRadioStore();
  const [trackName, setTrackName] = useState('Choose a local radio folder');
  const [toast, setToast] = useState('');
  const [tuning, setTuning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [defining, setDefining] = useState(false);
  const [definedText, setDefinedText] = useState('[]');
  const inputRef = useRef<HTMLInputElement>(null);
  const commercialsInputRef = useRef<HTMLInputElement>(null);
  const metadataInputRef = useRef<HTMLInputElement>(null);

  const engine = useMemo(() => new RadioEngine(), []);
  const schedulerRef = useRef<BroadcastScheduler | null>(null);
  const adUrlRef = useRef<string>('');
  const commercialsFileRef = useRef<File | null>(null);

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

  const stopScheduler = useCallback(() => {
    schedulerRef.current?.destroy();
    schedulerRef.current = null;
  }, []);

  const configureAdvertising = useCallback(async (stationId: string, track: LocalTrack) => {
    stopScheduler();
    const state = useRadioStore.getState();
    if (!state.advertising) return;

    const schedule = state.schedules.get(stationId);
    if (!schedule) { setScheduleStatus('No timestamps imported for this station'); return; }
    if (!state.cue || state.cue.ranges.length === 0 || !adUrlRef.current) {
      setScheduleStatus('Load the commercials recording to enable ad breaks');
      return;
    }

    const duration = engine.getDuration();
    if (!BroadcastScheduler.validate(schedule, duration, DEFAULT_SCHEDULER_OPTIONS)) {
      setScheduleStatus('Timestamps don’t match this file — playing uninterrupted');
      return;
    }

    const scheduler = new BroadcastScheduler({
      engine,
      schedule,
      durationSeconds: duration,
      adUrl: adUrlRef.current,
      cue: state.cue,
      callbacks: {
        onBreakStart: (ad) => {
          setTrackName(`📢 ${ad.label}`);
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: ad.label, artist: station.name, album: 'Commercial break' });
          }
          notify(`Ad break — ${ad.label}`);
        },
        onBreakEnd: () => {
          setTrackName(displayTrackName(track.name));
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: displayTrackName(track.name), artist: station.name, album: 'Los Santos Radio' });
          }
          setScheduleStatus('Ad break finished — station resumed');
        },
        onError: (message) => setScheduleStatus(message),
      },
    });

    if (scheduler.start()) {
      schedulerRef.current = scheduler;
      setScheduleStatus(`Ad breaks active · ${state.cue.ranges.length} spot${state.cue.ranges.length === 1 ? '' : 's'}`);
    }
  }, [engine, notify, setScheduleStatus, stopScheduler, station.name]);

  const activate = useCallback(async () => {
    const current = stations[useRadioStore.getState().selected];
    if (current.id === 'off') {
      stopScheduler(); engine.stop(); setPlaying(undefined); setTrackName('Radio Off'); return;
    }
    const available = useRadioStore.getState().tracks.get(current.id);
    if (!available?.length) { stopScheduler(); notify(`No audio matched “${current.name}”`); return; }
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
      await configureAdvertising(current.id, track);
    } catch (error) { stopScheduler(); notify(error instanceof Error ? error.message : 'Could not play this file'); }
  }, [engine, notify, setPlaying, configureAdvertising, stopScheduler]);

  useEffect(() => {
    engine.onEnded(() => void activate());
    return () => {
      engine.onEnded(() => {});
      stopScheduler();
      if (adUrlRef.current) URL.revokeObjectURL(adUrlRef.current);
      engine.destroy();
    };
  }, [activate, engine, stopScheduler]);

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

  // Load default + persisted timestamps and the persisted cue sheet once on mount.
  useEffect(() => {
    void (async () => {
      const defaults = getDefaultSchedules();
      let persisted: StationSchedule[] = [];
      try {
        const entries = await loadSchedulerEntries();
        const entry = entries.find(item => item.key === 'schedules');
        if (entry) persisted = JSON.parse(entry.json) as StationSchedule[];
      } catch { /* corrupt entry — ignore */ }
      setSchedules(mergeSchedules(defaults, persisted));
      try {
        const savedCue = await loadSetting<string>('cue');
        if (savedCue) setCue(JSON.parse(savedCue) as CueSheet);
      } catch { /* corrupt cue — ignore */ }
    })();
  }, [setSchedules, setCue]);

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

  const chooseCommercials = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    commercialsFileRef.current = file;
    if (adUrlRef.current) URL.revokeObjectURL(adUrlRef.current);
    adUrlRef.current = URL.createObjectURL(file);

    // If the exact same recording was already loaded, keep its (possibly
    // user-defined) ranges instead of re-detecting and losing edits.
    const existing = useRadioStore.getState().cue;
    if (existing && existing.name === file.name && existing.size === file.size) {
      setCue(existing);
      await saveSetting('cue', JSON.stringify(existing));
      notify(`Commercials loaded — ${existing.ranges.length} spot${existing.ranges.length === 1 ? '' : 's'}`);
      refreshActiveSchedule();
      return;
    }

    try {
      const cueSheet = await buildCommercialCueSheet(file);
      setCue(cueSheet);
      await saveSetting('cue', JSON.stringify(cueSheet));
      notify(`Commercials loaded — ${cueSheet.ranges.length} spot${cueSheet.ranges.length === 1 ? '' : 's'} detected`);
      refreshActiveSchedule();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read commercials file');
    }
  };

  const importMetadata = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const schedules = importRadioMetadata(JSON.parse(await file.text()));
      const merged = mergeSchedules(getDefaultSchedules(), schedules);
      setSchedules(merged);
      await saveSchedulerEntry('schedules', JSON.stringify(schedules));
      const matched = schedules.filter(s => s.valid).length;
      notify(`Timestamps imported — ${matched} station${matched === 1 ? '' : 's'} matched`);
      refreshActiveSchedule();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unrecognised radio timestamps file');
    }
  };

  const applyDefinedRanges = async () => {
    const file = commercialsFileRef.current;
    const existing = useRadioStore.getState().cue;
    if (!file || !existing) { notify('Choose the commercials recording first'); return; }
    try {
      const raw = JSON.parse(definedText);
      // Duration comes from the already-loaded file; defined text overrides detection.
      const ranges = parseDefinedRanges(raw, existing.duration);
      const cueSheet: CueSheet = {
        ...existing,
        ranges,
        recentIds: [],
        builtAt: Date.now(),
      };
      setCue(cueSheet);
      await saveSetting('cue', JSON.stringify(cueSheet));
      notify(`Cue sheet updated — ${ranges.length} spot${ranges.length === 1 ? '' : 's'}`);
      refreshActiveSchedule();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid cue sheet JSON');
      return;
    }
    setDefining(false);
  };

  const downloadCueSheet = async () => {
    const existing = useRadioStore.getState().cue;
    if (!existing) { notify('No cue sheet to download'); return; }
    const blob = new Blob([JSON.stringify(existing.ranges, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${existing.name.replace(/\.[^.]+$/, '')}-cue-sheet.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tuneToAdCompatibleStation = () => {
    // When the user flips the switch while a station is playing, re-tune so the
    // scheduler takes the new setting into account.
    if (useRadioStore.getState().playingStationId) void activate();
  };

  // After loading commercials / metadata, re-arm the scheduler for whichever
  // station is currently playing without making the user press play again.
  const refreshActiveSchedule = useCallback(() => {
    const state = useRadioStore.getState();
    if (!state.playingStationId) return;
    const track = state.tracks.get(state.playingStationId)?.[0];
    if (track) void configureAdvertising(state.playingStationId, track);
  }, [configureAdvertising]);

  const scheduleReadiness = scheduleStatus;

  return <main className="radio-app">
    <header className="topbar">
      <div className="brand"><strong>Los Santos</strong><span>Radio selector</span></div>
      <div className="topbar-actions">
        <button className="library-button" onClick={() => setPanelOpen(open => !open)}>Scheduler</button>
        <button className="library-button" onClick={() => void chooseFolder()}>Choose radio folder</button>
      </div>
      <input ref={inputRef} type="file" multiple accept="audio/*" hidden
        {...({ webkitdirectory: '' } as object)}
        onChange={event => void processFiles(Array.from(event.target.files ?? []))} />
      <input ref={commercialsInputRef} type="file" accept="audio/*" hidden
        onChange={event => void chooseCommercials(event.target.files)} />
      <input ref={metadataInputRef} type="file" accept="application/json,.json" hidden
        onChange={event => void importMetadata(event.target.files)} />
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

    <aside className={`scheduler-panel ${panelOpen ? 'open' : ''}`}>
      <div className="scheduler-header">
        <h2>Broadcast scheduler</h2>
        <button className="panel-toggle" onClick={() => setPanelOpen(false)}>×</button>
      </div>

      <label className="switch-row">
        <input type="checkbox" checked={advertising} onChange={event => { setAdvertising(event.target.checked); tuneToAdCompatibleStation(); }} />
        <span>Insert ad breaks at song boundaries</span>
      </label>

      <div className="scheduler-row">
        <div className="scheduler-file">
          <strong className="file-label">Commercials</strong>
          <span className="file-name">{commercialsName || 'none loaded'}</span>
        </div>
        <button className="scheduler-button" onClick={() => commercialsInputRef.current?.click()}>
          {commercialsName ? 'Change audio' : 'Choose audio'}
        </button>
      </div>

      {cue && (
        <div className="scheduler-meta">
          <span>{cue.ranges.length} spot{cue.ranges.length === 1 ? '' : 's'}</span>
          <button className="link-button" onClick={() => { setDefining(on => !on); if (!defining) setDefinedText(JSON.stringify(cue.ranges.map(r => ({ start: Math.round(r.start * 100) / 100, end: Math.round(r.end * 100) / 100, label: r.label })), null, 2)); }}>Edit ranges</button>
          <button className="link-button" onClick={() => void downloadCueSheet()}>Download</button>
        </div>
      )}

      {defining && cue && (
        <div className="defined-ranges">
          <textarea value={definedText} onChange={event => setDefinedText(event.target.value)} spellCheck={false} />
          <div className="defined-actions">
            <button className="scheduler-button" onClick={() => void applyDefinedRanges()}>Apply ranges</button>
            <button className="link-button" onClick={() => setDefining(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="scheduler-row">
        <div className="scheduler-file">
          <strong className="file-label">Station timestamps</strong>
          <span className="file-name">{schedules.size} station{schedules.size === 1 ? '' : 's'} mapped</span>
        </div>
        <button className="scheduler-button" onClick={() => metadataInputRef.current?.click()}>Import JSON</button>
      </div>

      <p className={`scheduler-status ${advertising ? 'on' : ''}`}>{scheduleReadiness}</p>
    </aside>

    <div className={`status ${tracks.size ? 'ready' : ''}`}>{status}</div>
    <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    <div className={`tuning ${tuning ? 'flash' : ''}`} onAnimationEnd={() => setTuning(false)} />
  </main>;
}
