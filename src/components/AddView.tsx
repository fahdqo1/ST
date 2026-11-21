import { useState } from "react";
import { buildEpisodes, fetchTorrentFiles, formatSize, guessShowName, parseLink, type LibraryItem } from "../lib/torrent";
import type { AppSettings } from "../lib/storage";

interface Props {
  settings: AppSettings;
  onSave: (item: LibraryItem, playIdx?: number) => void;
}

export default function AddView({ settings, onSave }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [linkIdx, setLinkIdx] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const [mName, setMName] = useState("");
  const [mRange, setMRange] = useState("");

  const run = async () => {
    setError(null);
    setItem(null);
    setManual(false);
    const parsed = parseLink(text);
    if (!parsed) {
      setError("I couldn't find a torrent hash in that text. Paste a link like http://127.0.0.1:11470/<40-char-hash>/7");
      return;
    }
    const base = parsed.base || settings.serverBase;
    setLinkIdx(parsed.idx);
    setBusy(true);
    try {
      const trackers = settings.trackers.split(/\s+/).filter(Boolean);
      const info = await fetchTorrentFiles(base, parsed.hash, trackers);
      const episodes = buildEpisodes(base, parsed.hash, info.files);
      if (!episodes.length) throw new Error("The torrent has no video files.");
      const numbered = episodes.filter((e) => e.episode !== null).length;
      setItem({
        id: parsed.hash,
        name: guessShowName(info.name) || info.name,
        base,
        kind: numbered >= 2 || episodes.length > 2 ? "series" : "movie",
        addedAt: Date.now(),
        episodes,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        `Couldn't read the file list from ${base}. ${msg === "Failed to fetch" ? "Is Stremio running? (The server must be reachable at that address.)" : msg} You can add the videos manually below.`
      );
      setManual(true);
      setMRange(parsed.idx !== null ? String(parsed.idx) : "0");
    } finally {
      setBusy(false);
    }
  };

  const saveManual = () => {
    const parsed = parseLink(text);
    if (!parsed) return;
    const base = parsed.base || settings.serverBase;
    const idxs: number[] = [];
    mRange.split(",").forEach((part) => {
      const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) return;
      const a = +m[1],
        b = m[2] ? +m[2] : a;
      for (let i = a; i <= Math.min(b, a + 500); i++) idxs.push(i);
    });
    if (!idxs.length) return;
    const name = mName.trim() || "Untitled";
    const single = idxs.length === 1;
    onSave(
      {
        id: parsed.hash,
        name,
        base,
        kind: single ? "movie" : "series",
        addedAt: Date.now(),
        episodes: idxs.map((idx, n) => ({
          idx,
          fileName: `file ${idx}`,
          title: single ? name : `Episode ${n + 1}`,
          season: null,
          episode: single ? null : n + 1,
          size: 0,
          url: `${base}/${parsed.hash}/${idx}`,
        })),
      },
      linkIdx ?? idxs[0]
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 sm:p-6">
        <h2 className="text-xl font-semibold mb-1">Add a movie or series</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Paste any Stremio streaming link (e.g. <code className="text-violet-300">http://127.0.0.1:11470/fe5346…1902/7</code>), a magnet link, or just the 40-character hash.
          I'll ask your local Stremio server for every file in the torrent and save them with name &amp; number.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="http://127.0.0.1:11470/fe5346e1fe8ca202003eb1c74518e12b95511902/7?"
          className="w-full rounded-xl bg-zinc-950 border border-white/10 focus:border-violet-500 outline-none px-4 py-3 text-sm font-mono resize-none"
        />
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button
            onClick={run}
            disabled={busy || !text.trim()}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-medium text-sm"
          >
            {busy ? "Reading torrent…" : "🔍 Extract episodes"}
          </button>
          <button
            onClick={() => navigator.clipboard.readText().then(setText).catch(() => {})}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            📋 Paste
          </button>
          <span className="text-xs text-zinc-500">Server: {settings.serverBase}</span>
        </div>
        {busy && <p className="text-xs text-zinc-400 mt-3">Waiting for torrent metadata — this can take up to ~20 seconds for new torrents…</p>}
        {error && <div className="mt-4 text-sm rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3">{error}</div>}
      </div>

      {manual && (
        <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-3">
          <h3 className="font-semibold">Manual add</h3>
          <p className="text-sm text-zinc-400">Enter the file index(es): <code className="text-violet-300">7</code> for one video, or <code className="text-violet-300">0-12</code>, <code className="text-violet-300">0-5,8,10</code> for many.</p>
          <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Title" className="w-full rounded-xl bg-zinc-950 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-violet-500" />
          <input value={mRange} onChange={(e) => setMRange(e.target.value)} placeholder="File indexes" className="w-full rounded-xl bg-zinc-950 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-violet-500" />
          <button onClick={saveManual} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium">Save &amp; play</button>
        </div>
      )}

      {item && (
        <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-zinc-400">Title</label>
              <input
                value={item.name}
                onChange={(e) => setItem({ ...item, name: e.target.value })}
                className="w-full mt-1 rounded-xl bg-zinc-950 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block">Type</label>
              <div className="mt-1 flex rounded-xl overflow-hidden border border-white/10 text-sm">
                {(["series", "movie"] as const).map((k) => (
                  <button key={k} onClick={() => setItem({ ...item, kind: k })} className={`px-4 py-2.5 ${item.kind === k ? "bg-violet-600" : "bg-zinc-950 hover:bg-zinc-800"}`}>
                    {k === "series" ? "Series" : "Movie"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-sm text-zinc-400">Found <b className="text-white">{item.episodes.length}</b> video file{item.episodes.length > 1 ? "s" : ""}:</div>
          <div className="max-h-96 overflow-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {item.episodes.map((e) => (
              <div key={e.idx} className={`flex items-center gap-3 px-3 py-2 text-sm ${e.idx === linkIdx ? "bg-violet-500/10" : ""}`}>
                <span className="w-10 shrink-0 text-xs text-zinc-500 tabular-nums">#{e.idx}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{e.title}</span>
                  <span className="block truncate text-xs text-zinc-500">{e.fileName}</span>
                </span>
                {e.idx === linkIdx && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600">your link</span>}
                <span className="text-xs text-zinc-500 shrink-0">{formatSize(e.size)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => onSave(item, linkIdx ?? item.episodes[0].idx)} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium">
              ▶ Save &amp; play{linkIdx !== null ? " (from your link)" : ""}
            </button>
            <button onClick={() => onSave(item)} className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm">
              Save to library
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
