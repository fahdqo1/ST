import { useMemo, useState } from "react";
import { formatSize, type Episode, type LibraryItem } from "../lib/torrent";
import type { Progress } from "../lib/storage";

interface Props {
  library: LibraryItem[];
  setLibrary: (l: LibraryItem[]) => void;
  progress: Record<string, Progress>;
  onPlay: (libId: string, idx: number) => void;
  onToggleWatched: (libId: string, idx: number) => void;
  currentKey: string | null;
}

export const pkey = (libId: string, idx: number) => `${libId}:${idx}`;

export function toJson(item: LibraryItem) {
  return {
    name: item.name,
    type: item.kind,
    infoHash: item.id,
    imdb: item.imdb || null,
    server: item.base,
    episodes: item.episodes.map((e, i) => ({
      number: e.episode ?? i + 1,
      season: e.season,
      name: e.title,
      fileIdx: e.idx,
      fileName: e.fileName,
      size: e.size,
      url: e.url,
    })),
  };
}

export function EpisodeList({
  item,
  progress,
  onPlay,
  onToggleWatched,
  currentKey,
  onRename,
  compact,
}: {
  item: LibraryItem;
  progress: Record<string, Progress>;
  onPlay: (idx: number) => void;
  onToggleWatched: (idx: number) => void;
  currentKey: string | null;
  onRename?: (idx: number, title: string) => void;
  compact?: boolean;
}) {
  const groups = useMemo(() => {
    const m = new Map<number | null, Episode[]>();
    item.episodes.forEach((e) => {
      const k = e.season;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    });
    return [...m.entries()];
  }, [item]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [val, setVal] = useState("");

  return (
    <div className="space-y-2">
      {groups.map(([season, eps]) => {
        const gk = String(season);
        const show = groups.length > 1 || season !== null;
        return (
          <div key={gk}>
            {show && (
              <button
                onClick={() => setCollapsed({ ...collapsed, [gk]: !collapsed[gk] })}
                className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-semibold"
              >
                <span>{season === null ? "Other videos" : season === 0 ? "Specials" : `Season ${season}`}</span>
                <span className="text-xs text-zinc-400">
                  {eps.filter((e) => progress[pkey(item.id, e.idx)]?.watched).length}/{eps.length} watched {collapsed[gk] ? "▸" : "▾"}
                </span>
              </button>
            )}
            {!collapsed[gk] && (
              <div className="divide-y divide-white/5">
                {eps.map((e) => {
                  const k = pkey(item.id, e.idx);
                  const pr = progress[k];
                  const pct = pr && pr.duration ? Math.min(100, (pr.time / pr.duration) * 100) : 0;
                  const active = currentKey === k;
                  return (
                    <div key={e.idx} className={`group relative flex items-center gap-3 px-3 ${compact ? "py-2" : "py-2.5"} rounded-lg hover:bg-white/5 ${active ? "bg-violet-500/15" : ""}`}>
                      <button onClick={() => onPlay(e.idx)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums ${active ? "bg-violet-600" : "bg-zinc-800 text-zinc-300"}`}>
                          {active ? "▶" : e.episode ?? "•"}
                        </span>
                        <span className="min-w-0 flex-1">
                          {editing === e.idx ? (
                            <input
                              autoFocus
                              value={val}
                              onClick={(ev) => ev.stopPropagation()}
                              onChange={(ev) => setVal(ev.target.value)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter") {
                                  onRename?.(e.idx, val.trim() || e.title);
                                  setEditing(null);
                                }
                                if (ev.key === "Escape") setEditing(null);
                              }}
                              onBlur={() => {
                                onRename?.(e.idx, val.trim() || e.title);
                                setEditing(null);
                              }}
                              className="w-full bg-zinc-950 border border-violet-500 rounded px-2 py-1 text-sm outline-none"
                            />
                          ) : (
                            <span className={`block truncate text-sm ${pr?.watched ? "text-zinc-500" : ""}`}>{e.title}</span>
                          )}
                          {!compact && (
                            <span className="block truncate text-[11px] text-zinc-500">
                              #{e.idx} · {e.fileName.split("/").pop()} {e.size ? `· ${formatSize(e.size)}` : ""}
                            </span>
                          )}
                        </span>
                      </button>
                      {pr && !pr.watched && pct > 1 && <span className="text-[11px] text-violet-300 shrink-0">{Math.round(pct)}%</span>}
                      {pr?.watched && <span className="text-emerald-400 text-sm shrink-0">✓</span>}
                      {onRename && (
                        <button
                          title="Rename"
                          onClick={() => {
                            setVal(e.title);
                            setEditing(e.idx);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white text-sm shrink-0"
                        >
                          ✎
                        </button>
                      )}
                      <button
                        title={pr?.watched ? "Mark unwatched" : "Mark watched"}
                        onClick={() => onToggleWatched(e.idx)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white text-sm shrink-0"
                      >
                        {pr?.watched ? "↺" : "✔"}
                      </button>
                      {pct > 0 && !pr?.watched && (
                        <div className="absolute left-3 right-3 bottom-0 h-0.5 bg-white/5">
                          <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LibraryView({ library, setLibrary, progress, onPlay, onToggleWatched, currentKey }: Props) {
  const [open, setOpen] = useState<string | null>(library[0]?.id ?? null);
  const [jsonFor, setJsonFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!library.length)
    return (
      <div className="text-center py-24 text-zinc-400">
        <div className="text-5xl mb-3">📚</div>
        Your library is empty. Use the <b className="text-white">Add</b> tab to paste a link.
      </div>
    );

  const update = (id: string, fn: (i: LibraryItem) => LibraryItem) => setLibrary(library.map((i) => (i.id === id ? fn(i) : i)));

  const download = (item: LibraryItem) => {
    const blob = new Blob([JSON.stringify(toJson(item), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${item.name.replace(/[^\w\-]+/g, "_")}.json`;
    a.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {library.map((item) => {
        const isOpen = open === item.id;
        const watched = item.episodes.filter((e) => progress[pkey(item.id, e.idx)]?.watched).length;
        return (
          <div key={item.id} className="rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <button onClick={() => setOpen(isOpen ? null : item.id)} className="flex-1 min-w-0 text-left flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-xl shrink-0">{item.kind === "series" ? "📺" : "🎬"}</div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{item.name}</div>
                  <div className="text-xs text-zinc-400">
                    {item.kind === "series" ? "Series" : "Movie"} · {item.episodes.length} video{item.episodes.length > 1 ? "s" : ""} · {watched} watched
                    {item.imdb ? ` · ${item.imdb}` : ""}
                  </div>
                </div>
              </button>
              <button onClick={() => setJsonFor(jsonFor === item.id ? null : item.id)} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs">{`{ } JSON`}</button>
              <button
                onClick={() => {
                  if (confirm(`Remove "${item.name}" from library?`)) setLibrary(library.filter((i) => i.id !== item.id));
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-600/70 text-xs"
              >
                🗑
              </button>
            </div>
            {jsonFor === item.id && (
              <div className="px-4 pb-4">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(toJson(item), null, 2));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                  <button onClick={() => download(item)} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs">⬇ Download .json</button>
                </div>
                <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-950 border border-white/10 p-3 text-[11px] text-emerald-200/90">{JSON.stringify(toJson(item), null, 2)}</pre>
              </div>
            )}
            {isOpen && (
              <div className="px-2 pb-3 border-t border-white/5 pt-2">
                <div className="px-2 pb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span>Title:</span>
                  <input
                    value={item.name}
                    onChange={(e) => update(item.id, (i) => ({ ...i, name: e.target.value }))}
                    className="bg-zinc-950 border border-white/10 rounded px-2 py-1 text-white text-xs outline-none focus:border-violet-500 w-48"
                  />
                  <button onClick={() => update(item.id, (i) => ({ ...i, kind: i.kind === "series" ? "movie" : "series" }))} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                    Type: {item.kind}
                  </button>
                  <span className="ml-auto">Hover an episode: ✎ rename · ✔ watched</span>
                </div>
                <EpisodeList
                  item={item}
                  progress={progress}
                  currentKey={currentKey}
                  onPlay={(idx) => onPlay(item.id, idx)}
                  onToggleWatched={(idx) => onToggleWatched(item.id, idx)}
                  onRename={(idx, title) => update(item.id, (i) => ({ ...i, episodes: i.episodes.map((e) => (e.idx === idx ? { ...e, title } : e)) }))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
