import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Player from "./components/Player";
import AddView from "./components/AddView";
import LibraryView, { EpisodeList, pkey } from "./components/LibraryView";
import SubsView from "./components/SubsView";
import SettingsView from "./components/SettingsView";
import { DEFAULT_SETTINGS, DEFAULT_SUB, useStored, type AppSettings, type Progress, type SubSettings } from "./lib/storage";
import type { LibraryItem } from "./lib/torrent";
import { loadSubsFromUrl, searchSubs, type SubTrack } from "./lib/subs";

type Tab = "home" | "add" | "library" | "player" | "subs" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "add", label: "Add", icon: "➕" },
  { id: "library", label: "Library", icon: "📚" },
  { id: "player", label: "Player", icon: "▶️" },
  { id: "subs", label: "Subtitles", icon: "💬" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

interface SavedTrack {
  id: string;
  label: string;
  lang?: string;
  url: string;
}

const fmtT = (t: number) => {
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
};

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [library, setLibrary] = useStored<LibraryItem[]>("mp.library", []);
  const [progress, setProgress] = useStored<Record<string, Progress>>("mp.progress", {});
  const [settings, setSettings] = useStored<AppSettings>("mp.settings", DEFAULT_SETTINGS);
  const [sub, setSub] = useStored<SubSettings>("mp.sub", DEFAULT_SUB);
  const [current, setCurrent] = useStored<{ libId: string; idx: number } | null>("mp.current", null);
  const [savedTracks, setSavedTracks] = useStored<Record<string, SavedTrack[]>>("mp.tracks", {});
  const [savedActive, setSavedActive] = useStored<Record<string, string>>("mp.activeTrack", {});

  const [tracks, setTracks] = useState<SubTrack[]>([]);
  const [activeTrack, setActiveTrackState] = useState<string | null>(null);
  const token = useRef(0);

  const item = useMemo(() => library.find((l) => l.id === current?.libId) || null, [library, current]);
  const episode = useMemo(() => item?.episodes.find((e) => e.idx === current?.idx) || null, [item, current]);
  const key = item && episode ? pkey(item.id, episode.idx) : null;
  const epPos = item && episode ? item.episodes.findIndex((e) => e.idx === episode.idx) : -1;

  // Load saved / auto subtitles when the episode changes
  useEffect(() => {
    const my = ++token.current;
    setTracks([]);
    setActiveTrackState(null);
    if (!key || !item || !episode) return;
    (async () => {
      const saved = savedTracks[key] || [];
      const loaded: SubTrack[] = [];
      for (const s of saved) {
        try {
          const cues = await loadSubsFromUrl(s.url, settings.serverBase);
          loaded.push({ ...s, cues });
        } catch {
          /* skip */
        }
      }
      if (my !== token.current) return;
      if (loaded.length) {
        setTracks(loaded);
        const a = savedActive[key];
        if (a === "") setActiveTrackState(null);
        else setActiveTrackState(loaded.find((t) => t.id === a)?.id ?? loaded[0].id);
        return;
      }
      if (settings.autoSubs && item.imdb && savedActive[key] !== "") {
        try {
          const res = await searchSubs(item.imdb, item.kind, episode.season ?? (item.kind === "series" ? 1 : null), episode.episode);
          const pick = res.find((r) => r.lang === settings.subLang);
          if (pick) {
            const cues = await loadSubsFromUrl(pick.url, settings.serverBase);
            if (my !== token.current) return;
            const t: SubTrack = { id: `r:${pick.id}`, label: pick.label, lang: pick.lang, url: pick.url, cues };
            setTracks([t]);
            setActiveTrackState(t.id);
            setSavedTracks((s) => ({ ...s, [key]: [{ id: t.id, label: t.label, lang: t.lang, url: pick.url }] }));
          }
        } catch {
          /* ignore */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setActiveTrack = useCallback(
    (id: string | null) => {
      setActiveTrackState(id);
      if (key) setSavedActive((s) => ({ ...s, [key]: id ?? "" }));
    },
    [key, setSavedActive]
  );

  const addTrack = useCallback(
    (t: SubTrack, activate = true) => {
      setTracks((old) => [...old.filter((o) => o.id !== t.id), t]);
      if (t.url && key) setSavedTracks((s) => ({ ...s, [key]: [...(s[key] || []).filter((o) => o.id !== t.id), { id: t.id, label: t.label, lang: t.lang, url: t.url! }] }));
      if (activate) setActiveTrack(t.id);
    },
    [key, setSavedTracks, setActiveTrack]
  );

  const removeTrack = useCallback(
    (id: string) => {
      setTracks((old) => old.filter((o) => o.id !== id));
      if (key) setSavedTracks((s) => ({ ...s, [key]: (s[key] || []).filter((o) => o.id !== id) }));
      if (activeTrack === id) setActiveTrack(null);
    },
    [key, activeTrack, setSavedTracks, setActiveTrack]
  );

  const play = useCallback(
    (libId: string, idx: number) => {
      setCurrent({ libId, idx });
      setTab("player");
      window.scrollTo({ top: 0 });
    },
    [setCurrent]
  );

  const save = useCallback(
    (libItem: LibraryItem, playIdx?: number) => {
      setLibrary((lib) => {
        const old = lib.find((l) => l.id === libItem.id);
        const merged = old ? { ...libItem, imdb: old.imdb, addedAt: old.addedAt } : libItem;
        return [merged, ...lib.filter((l) => l.id !== libItem.id)];
      });
      if (playIdx !== undefined) play(libItem.id, playIdx);
      else setTab("library");
    },
    [setLibrary, play]
  );

  const onProgress = useCallback(
    (time: number, duration: number) => {
      if (!item || !episode || !key) return;
      setProgress((p) => ({
        ...p,
        [key]: {
          url: episode.url,
          libId: item.id,
          idx: episode.idx,
          title: episode.title,
          show: item.name,
          time,
          duration,
          updated: Date.now(),
          watched: p[key]?.watched || time / duration > 0.92,
        },
      }));
    },
    [item, episode, key, setProgress]
  );

  const toggleWatched = (libId: string, idx: number) => {
    const it = library.find((l) => l.id === libId);
    const ep = it?.episodes.find((e) => e.idx === idx);
    if (!it || !ep) return;
    const k = pkey(libId, idx);
    setProgress((p) => ({
      ...p,
      [k]: { url: ep.url, libId, idx, title: ep.title, show: it.name, time: p[k]?.watched ? 0 : 0, duration: p[k]?.duration || 0, updated: Date.now(), watched: !p[k]?.watched },
    }));
  };

  const goNext = useCallback(() => {
    if (!item || epPos < 0 || epPos >= item.episodes.length - 1) return;
    setCurrent({ libId: item.id, idx: item.episodes[epPos + 1].idx });
  }, [item, epPos, setCurrent]);
  const goPrev = useCallback(() => {
    if (!item || epPos <= 0) return;
    setCurrent({ libId: item.id, idx: item.episodes[epPos - 1].idx });
  }, [item, epPos, setCurrent]);

  const onEnded = () => {
    if (key && item && episode)
      setProgress((p) => ({
        ...p,
        [key]: { url: episode.url, libId: item.id, idx: episode.idx, title: episode.title, show: item.name, time: 0, duration: p[key]?.duration || 0, updated: Date.now(), watched: true },
      }));
    if (settings.autoNext && item && epPos < item.episodes.length - 1) goNext();
  };

  // Home data
  const history = Object.values(progress).filter((p) => library.some((l) => l.id === p.libId));
  const cont = history.filter((p) => !p.watched && p.time > 5).sort((a, b) => b.updated - a.updated).slice(0, 12);
  const nextUp = library
    .map((l) => {
      const ps = history.filter((p) => p.libId === l.id).sort((a, b) => b.updated - a.updated);
      const last = ps.find((p) => p.watched);
      if (!last || ps[0]?.updated !== last.updated) return null;
      const pos = l.episodes.findIndex((e) => e.idx === last.idx);
      const nx = l.episodes[pos + 1];
      return nx ? { item: l, ep: nx, updated: last.updated } : null;
    })
    .filter(Boolean) as { item: LibraryItem; ep: LibraryItem["episodes"][number]; updated: number }[];

  const startAt = key && progress[key] && !progress[key].watched ? progress[key].time : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 h-14">
          <div className="flex items-center gap-2 font-bold tracking-tight shrink-0">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm">▶</span>
            <span className="hidden sm:inline">My Player</span>
          </div>
          <nav className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 sm:px-4 h-9 rounded-lg text-sm whitespace-nowrap flex items-center gap-1.5 transition ${tab === t.id ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"}`}
              >
                <span>{t.icon}</span>
                <span className={tab === t.id ? "" : "hidden md:inline"}>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === "home" && (
          <div className="space-y-8 max-w-5xl mx-auto">
            {cont.length === 0 && nextUp.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🎬</div>
                <h1 className="text-2xl font-bold mb-2">Your own Stremio-style player</h1>
                <p className="text-zinc-400 max-w-lg mx-auto mb-6">
                  Paste a link from Stremio's local server, get every episode with its name &amp; number, play it with subtitles, and continue exactly where you stopped.
                </p>
                <button onClick={() => setTab("add")} className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium">➕ Add your first link</button>
              </div>
            )}
            {cont.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Continue watching</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cont.map((p) => (
                    <button key={pkey(p.libId, p.idx)} onClick={() => play(p.libId, p.idx)} className="text-left rounded-2xl bg-zinc-900 border border-white/10 hover:border-violet-500/60 p-4 transition group">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-violet-600 group-hover:scale-110 transition flex items-center justify-center shrink-0">▶</div>
                        <div className="min-w-0">
                          <div className="text-xs text-zinc-400 truncate">{p.show}</div>
                          <div className="font-medium truncate">{p.title}</div>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, (p.time / (p.duration || 1)) * 100)}%` }} />
                      </div>
                      <div className="mt-1.5 text-xs text-zinc-500 flex justify-between">
                        <span>{fmtT(p.time)} / {fmtT(p.duration)}</span>
                        <span>{new Date(p.updated).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {nextUp.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Next up</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nextUp.map((n) => (
                    <button key={n.item.id} onClick={() => play(n.item.id, n.ep.idx)} className="text-left rounded-2xl bg-zinc-900 border border-white/10 hover:border-violet-500/60 p-4">
                      <div className="text-xs text-zinc-400 truncate">{n.item.name}</div>
                      <div className="font-medium truncate">{n.ep.title}</div>
                      <div className="text-xs text-violet-300 mt-2">⏭ Play next episode</div>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {library.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Library</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {library.map((l) => (
                    <button key={l.id} onClick={() => { const first = l.episodes.find((e) => !progress[pkey(l.id, e.idx)]?.watched) || l.episodes[0]; play(l.id, first.idx); }} className="text-left rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/60 border border-white/10 hover:border-violet-500/60 p-4 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-xl shrink-0">{l.kind === "series" ? "📺" : "🎬"}</div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-xs text-zinc-400">{l.episodes.length} video{l.episodes.length > 1 ? "s" : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "add" && <AddView settings={settings} onSave={save} />}

        {tab === "library" && (
          <LibraryView
            library={library}
            setLibrary={setLibrary}
            progress={progress}
            onPlay={play}
            onToggleWatched={toggleWatched}
            currentKey={key}
          />
        )}

        {tab === "player" &&
          (item && episode ? (
            <div className="grid xl:grid-cols-[1fr_360px] gap-6">
              <div className="min-w-0">
                <Player
                  url={episode.url}
                  title={`${item.name} — ${episode.title}`}
                  subtitle={item.name}
                  startAt={startAt}
                  settings={settings}
                  sub={sub}
                  setSub={setSub}
                  tracks={tracks}
                  activeTrack={activeTrack}
                  setActiveTrack={setActiveTrack}
                  hasPrev={epPos > 0}
                  hasNext={epPos < item.episodes.length - 1}
                  onPrev={goPrev}
                  onNext={goNext}
                  onEnded={onEnded}
                  onProgress={onProgress}
                  onOpenSubs={() => setTab("subs")}
                  onSpeed={(speed) => setSettings({ ...settings, speed })}
                  onVolume={(volume) => setSettings({ ...settings, volume })}
                />
                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-400">{item.name}</div>
                    <h1 className="text-xl font-semibold">{episode.title}</h1>
                    <div className="text-xs text-zinc-500 mt-1 truncate">{episode.fileName}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={goPrev} disabled={epPos <= 0} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-sm">⏮ Prev</button>
                    <button onClick={goNext} disabled={epPos >= item.episodes.length - 1} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-sm">Next ⏭</button>
                    <button onClick={() => setTab("subs")} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">💬 Subtitles</button>
                    <button onClick={() => navigator.clipboard.writeText(episode.url)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">🔗 Copy link</button>
                  </div>
                </div>
              </div>
              <aside className="rounded-2xl bg-zinc-900 border border-white/10 p-3 xl:max-h-[calc(100vh-7rem)] xl:sticky xl:top-20 overflow-auto">
                <div className="px-2 py-1.5 text-sm font-semibold">{item.name} <span className="text-zinc-500 font-normal">· {item.episodes.length}</span></div>
                <EpisodeList item={item} progress={progress} currentKey={key} onPlay={(idx) => play(item.id, idx)} onToggleWatched={(idx) => toggleWatched(item.id, idx)} compact />
              </aside>
            </div>
          ) : (
            <div className="text-center py-24 text-zinc-400">
              <div className="text-5xl mb-3">🍿</div>
              Nothing selected. Pick something from the <button className="text-violet-300 underline" onClick={() => setTab("library")}>Library</button> or <button className="text-violet-300 underline" onClick={() => setTab("add")}>add a link</button>.
            </div>
          ))}

        {tab === "subs" && (
          <SubsView
            item={item}
            episode={episode}
            tracks={tracks}
            activeTrack={activeTrack}
            setActiveTrack={setActiveTrack}
            addTrack={addTrack}
            removeTrack={removeTrack}
            sub={sub}
            setSub={setSub}
            settings={settings}
            setImdb={(id) => item && setLibrary((lib) => lib.map((l) => (l.id === item.id ? { ...l, imdb: id } : l)))}
          />
        )}

        {tab === "settings" && <SettingsView settings={settings} setSettings={setSettings} library={library} setLibrary={setLibrary} progress={progress} setProgress={setProgress} />}
      </main>
    </div>
  );
}
