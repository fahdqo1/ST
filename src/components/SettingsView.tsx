import { useRef, useState } from "react";
import type { AppSettings, Progress } from "../lib/storage";
import { toJson } from "./LibraryView";
import { buildEpisodes, type LibraryItem } from "../lib/torrent";

interface Props {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  library: LibraryItem[];
  setLibrary: (l: LibraryItem[]) => void;
  progress: Record<string, Progress>;
  setProgress: (p: Record<string, Progress>) => void;
}

export default function SettingsView({ settings, setSettings, library, setLibrary, progress, setProgress }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [test, setTest] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const note = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  };

  const applyServer = () => {
    const base = settings.serverBase.replace(/\/+$/, "");
    setLibrary(
      library.map((i) => ({
        ...i,
        base,
        episodes: i.episodes.map((e) => ({ ...e, url: `${base}/${i.id}/${e.idx}` })),
      }))
    );
    note(`All library links now use ${base}`);
  };

  const checkServer = async () => {
    setTest("Checking…");
    try {
      const r = await fetch(`${settings.serverBase}/settings`);
      setTest(r.ok ? "✅ Stremio server is reachable" : `⚠️ Server answered ${r.status}`);
    } catch {
      setTest("❌ Can't reach the server. Is Stremio running?");
    }
  };

  const exportAll = () => {
    const data = { app: "my-stremio-player", version: 1, library, progress, settings };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "my-player-backup.json";
    a.click();
  };

  const importText = (text: string) => {
    try {
      const j = JSON.parse(text);
      if (j.app === "my-stremio-player") {
        const map = new Map(library.map((i) => [i.id, i]));
        (j.library as LibraryItem[]).forEach((i) => map.set(i.id, i));
        setLibrary([...map.values()]);
        setProgress({ ...progress, ...(j.progress || {}) });
        if (j.settings) setSettings({ ...settings, ...j.settings });
        note("Backup imported");
        return;
      }
      // single-item JSON export
      if (j.infoHash && Array.isArray(j.episodes)) {
        const base = j.server || settings.serverBase;
        const eps = j.episodes.map((e: { fileIdx: number; name: string; fileName?: string; season: number | null; number: number; size?: number }) => ({
          idx: e.fileIdx,
          fileName: e.fileName || `file ${e.fileIdx}`,
          title: e.name,
          season: e.season ?? null,
          episode: j.type === "movie" ? null : e.number,
          size: e.size || 0,
          url: `${base}/${j.infoHash}/${e.fileIdx}`,
        }));
        const item: LibraryItem = { id: j.infoHash, name: j.name, base, kind: j.type === "movie" ? "movie" : "series", imdb: j.imdb || undefined, addedAt: Date.now(), episodes: eps };
        void buildEpisodes;
        setLibrary([item, ...library.filter((i) => i.id !== item.id)]);
        note(`Imported "${item.name}"`);
        return;
      }
      note("Unknown JSON format.");
    } catch {
      note("That is not valid JSON.");
    }
  };

  const T = ({ label, hint, k }: { label: string; hint?: string; k: "autoNext" | "autoResume" | "autoSubs" }) => (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      </span>
      <button
        onClick={() => setSettings({ ...settings, [k]: !settings[k] })}
        className={`w-11 h-6 rounded-full relative shrink-0 transition ${settings[k] ? "bg-violet-600" : "bg-zinc-700"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${settings[k] ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {msg && <div className="rounded-xl bg-violet-500/15 border border-violet-500/30 px-4 py-2.5 text-sm">{msg}</div>}
      <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-3">
        <h3 className="font-semibold">Stremio server</h3>
        <div className="flex gap-2">
          <input value={settings.serverBase} onChange={(e) => setSettings({ ...settings, serverBase: e.target.value.trim() })} className="flex-1 rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-sm font-mono outline-none focus:border-violet-500" />
          <button onClick={checkServer} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Test</button>
        </div>
        {test && <div className="text-sm">{test}</div>}
        <button onClick={applyServer} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs">Apply this address to all saved library links</button>
        <p className="text-xs text-zinc-500">
          Stremio must be open on this computer. If the page is opened from another device, use your PC's LAN address (e.g. http://192.168.1.10:11470) and enable "Streaming server → allow remote" in Stremio.
        </p>
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer">Extra trackers (optional, one per line)</summary>
          <textarea value={settings.trackers} onChange={(e) => setSettings({ ...settings, trackers: e.target.value })} rows={3} className="w-full mt-2 rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 font-mono outline-none" placeholder="udp://tracker.opentrackr.org:1337/announce" />
        </details>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 divide-y divide-white/5">
        <h3 className="font-semibold pb-3">Playback</h3>
        <T label="Resume where I stopped" hint="Jump to the saved time when you open a video" k="autoResume" />
        <T label="Auto-play next episode" k="autoNext" />
        <T label="Auto-load subtitles" hint="If the title has an IMDb id, fetch a subtitle in your preferred language" k="autoSubs" />
        <div className="py-3 flex items-center justify-between gap-4">
          <span className="text-sm">Preferred subtitle language (3-letter code)</span>
          <input value={settings.subLang} onChange={(e) => setSettings({ ...settings, subLang: e.target.value.trim().toLowerCase() })} className="w-24 rounded-lg bg-zinc-950 border border-white/10 px-3 py-1.5 text-sm text-center outline-none focus:border-violet-500" placeholder="ara" />
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-3">
        <h3 className="font-semibold">Backup &amp; import JSON</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportAll} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm">⬇ Export everything</button>
          <button
            onClick={() => {
              const all = library.map(toJson);
              navigator.clipboard.writeText(JSON.stringify(all, null, 2));
              note("Library JSON copied");
            }}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            Copy library JSON
          </button>
          <input ref={file} type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) importText(await f.text()); }} />
          <button onClick={() => file.current?.click()} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">⬆ Import file</button>
        </div>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder="…or paste exported JSON here" className="w-full rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-xs font-mono outline-none focus:border-violet-500" />
        <button onClick={() => { importText(paste); setPaste(""); }} disabled={!paste.trim()} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm">Import pasted JSON</button>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-red-500/20 p-5 space-y-2">
        <h3 className="font-semibold">Danger zone</h3>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => confirm("Clear all watch progress?") && setProgress({})} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-600/70 text-sm">Clear watch history</button>
          <button onClick={() => confirm("Delete the whole library?") && setLibrary([])} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-600/70 text-sm">Clear library</button>
        </div>
      </div>
    </div>
  );
}
