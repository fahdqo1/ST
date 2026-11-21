import { useEffect, useRef, useState } from "react";
import { LANG_NAMES, parseSubs, decodeBuffer, searchCinemeta, searchSubs, loadSubsFromUrl, type Meta, type RemoteSub, type SubTrack } from "../lib/subs";
import { DEFAULT_SUB, type AppSettings, type SubSettings } from "../lib/storage";
import type { Episode, LibraryItem } from "../lib/torrent";

interface Props {
  item: LibraryItem | null;
  episode: Episode | null;
  tracks: SubTrack[];
  activeTrack: string | null;
  setActiveTrack: (id: string | null) => void;
  addTrack: (t: SubTrack, activate?: boolean) => void;
  removeTrack: (id: string) => void;
  sub: SubSettings;
  setSub: (s: SubSettings) => void;
  settings: AppSettings;
  setImdb: (id: string) => void;
}

const FONTS = [
  ["System", "system-ui, sans-serif"],
  ["Arial", "Arial, Helvetica, sans-serif"],
  ["Tahoma (Arabic)", "Tahoma, Arial, sans-serif"],
  ["Serif", "Georgia, serif"],
  ["Monospace", "ui-monospace, Menlo, monospace"],
  ["Rounded", "'Trebuchet MS', sans-serif"],
];
const COLORS = ["#ffffff", "#ffe066", "#7CFC00", "#00e5ff", "#ff9ecb", "#ff6b6b"];

export default function SubsView(p: Props) {
  const { item, episode, sub, setSub } = p;
  const [lang, setLang] = useState(p.settings.subLang);
  const [results, setResults] = useState<RemoteSub[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [q, setQ] = useState(item?.name || "");
  const [metas, setMetas] = useState<Meta[]>([]);
  const [imdb, setImdbLocal] = useState(item?.imdb || "");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImdbLocal(item?.imdb || "");
    setQ(item?.name || "");
    setResults(null);
  }, [item?.id]);

  const note = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  const search = async () => {
    if (!item) return;
    if (!/^tt\d+$/.test(imdb.trim())) return note("Enter an IMDb id like tt0903747 (or search by name below).");
    setBusy(true);
    setResults(null);
    try {
      p.setImdb(imdb.trim());
      const r = await searchSubs(imdb.trim(), item.kind, episode?.season ?? (item.kind === "series" ? 1 : null), episode?.episode ?? null);
      setResults(r);
      if (!r.length) note("No subtitles found for this video.");
    } catch (e) {
      note(`Search failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const useRemote = async (s: RemoteSub) => {
    setBusy(true);
    try {
      const cues = await loadSubsFromUrl(s.url, p.settings.serverBase);
      p.addTrack({ id: `r:${s.id}`, label: s.label, lang: s.lang, url: s.url, cues }, true);
      note(`Loaded ${s.label} (${cues.length} lines)`);
    } catch (e) {
      note(`Couldn't load: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const addUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const cues = await loadSubsFromUrl(url.trim(), p.settings.serverBase);
      p.addTrack({ id: `u:${url.trim()}`, label: `Custom URL ${p.tracks.filter((t) => t.id.startsWith("u:")).length + 1}`, url: url.trim(), cues }, true);
      setUrl("");
      note(`Loaded ${cues.length} lines`);
    } catch (e) {
      note(`Couldn't load: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const cues = parseSubs(decodeBuffer(await f.arrayBuffer()));
    if (!cues.length) return note("Couldn't read that file (use .srt or .vtt).");
    p.addTrack({ id: `f:${f.name}:${f.size}`, label: f.name, cues }, true);
    note(`Loaded ${cues.length} lines`);
  };

  const findMeta = async () => {
    if (!item || !q.trim()) return;
    setBusy(true);
    try {
      setMetas(await searchCinemeta(q.trim(), item.kind));
    } catch (e) {
      note(`Search failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const langs = results ? [...new Set(results.map((r) => r.lang))] : [];
  const shown = results?.filter((r) => lang === "all" || r.lang === lang) || [];

  return (
    <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <Card title="Subtitles for this video">
          <p className="text-sm text-zinc-400 -mt-2">
            {episode && item ? (
              <>
                {item.name} — <span className="text-zinc-200">{episode.title}</span>
              </>
            ) : (
              "Start playing something first."
            )}
          </p>
          {p.tracks.length > 0 ? (
            <div className="space-y-1">
              <Row active={!p.activeTrack} onClick={() => p.setActiveTrack(null)}>Off</Row>
              {p.tracks.map((t) => (
                <Row key={t.id} active={t.id === p.activeTrack} onClick={() => p.setActiveTrack(t.id)} onRemove={() => p.removeTrack(t.id)}>
                  {t.label} <span className="text-xs text-zinc-500">· {t.cues.length} lines</span>
                </Row>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No subtitles loaded yet.</p>
          )}
          {msg && <div className="text-sm rounded-lg bg-violet-500/15 border border-violet-500/30 px-3 py-2">{msg}</div>}
        </Card>

        <Card title="Find subtitles (OpenSubtitles via Stremio)">
          <div className="flex gap-2">
            <input value={imdb} onChange={(e) => setImdbLocal(e.target.value)} placeholder="IMDb id e.g. tt0903747" className="flex-1 rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-500" />
            <button onClick={search} disabled={busy || !item} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm">Search</button>
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findMeta()} placeholder="Don't know the id? Search by name" className="flex-1 rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-500" />
            <button onClick={findMeta} disabled={busy || !item} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm">Find ID</button>
          </div>
          {metas.length > 0 && (
            <div className="grid grid-cols-1 gap-1">
              {metas.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setImdbLocal(m.id);
                    p.setImdb(m.id);
                    setMetas([]);
                  }}
                  className="flex items-center gap-3 text-left px-2 py-1.5 rounded-lg hover:bg-white/10"
                >
                  {m.poster ? <img src={m.poster} alt="" className="w-8 h-12 object-cover rounded" /> : <div className="w-8 h-12 bg-zinc-800 rounded" />}
                  <span className="text-sm flex-1 truncate">{m.name} <span className="text-zinc-500">{m.year}</span></span>
                  <span className="text-xs text-violet-300">{m.id}</span>
                </button>
              ))}
            </div>
          )}
          {results && results.length > 0 && (
            <>
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-sm">
                <option value="all">All languages ({results.length})</option>
                {langs.map((l) => (
                  <option key={l} value={l}>{LANG_NAMES[l] || l} ({results.filter((r) => r.lang === l).length})</option>
                ))}
              </select>
              <div className="max-h-64 overflow-auto space-y-1">
                {shown.map((s) => (
                  <button key={s.id} onClick={() => useRemote(s)} disabled={busy} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-sm">
                    <span>{s.label}</span>
                    <span className="text-xs text-violet-300">Use</span>
                  </button>
                ))}
                {!shown.length && <div className="text-sm text-zinc-500 px-1">No results in this language.</div>}
              </div>
            </>
          )}
        </Card>

        <Card title="Add your own">
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} placeholder="Link to .srt / .vtt" className="flex-1 rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-500" />
            <button onClick={addUrl} disabled={busy} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Add</button>
          </div>
          <input ref={file} type="file" accept=".srt,.vtt,.ass,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button onClick={() => file.current?.click()} className="w-full px-4 py-2.5 rounded-lg border border-dashed border-white/20 hover:border-violet-400 text-sm text-zinc-300">📁 Choose subtitle file from computer</button>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Subtitle style">
          <div className="relative rounded-xl overflow-hidden h-40 bg-gradient-to-br from-slate-700 via-slate-800 to-zinc-900 flex items-end justify-center pb-4">
            <div
              dir="auto"
              style={{
                fontSize: `${Math.max(12, (160 * sub.size) / 100 * 1.6)}px`,
                color: sub.color,
                fontWeight: sub.bold ? 700 : 400,
                fontFamily: sub.font,
                background: `rgba(0,0,0,${sub.bg})`,
                padding: sub.bg > 0 ? "0.1em 0.5em" : 0,
                borderRadius: 6,
                textShadow: sub.outline ? "0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000" : "none",
              }}
            >
              This is how subtitles look — هكذا تظهر الترجمة
            </div>
          </div>
          <Slider label="Size" value={sub.size} min={2} max={9} step={0.2} unit="%" onChange={(v) => setSub({ ...sub, size: v })} />
          <Slider label="Vertical position" value={sub.bottom} min={0} max={40} step={1} unit="%" onChange={(v) => setSub({ ...sub, bottom: v })} />
          <Slider label="Background opacity" value={sub.bg} min={0} max={1} step={0.05} unit="" onChange={(v) => setSub({ ...sub, bg: v })} />
          <Slider label="Delay / sync" value={sub.delay} min={-30} max={30} step={0.1} unit="s" onChange={(v) => setSub({ ...sub, delay: Math.round(v * 10) / 10 })} />
          <div className="flex gap-2 -mt-1">
            {[-5, -1, -0.5, 0.5, 1, 5].map((d) => (
              <button key={d} onClick={() => setSub({ ...sub, delay: Math.round((sub.delay + d) * 10) / 10 })} className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs">{d > 0 ? `+${d}` : d}s</button>
            ))}
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-1.5">Color</div>
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setSub({ ...sub, color: c })} className={`w-8 h-8 rounded-full border-2 ${sub.color === c ? "border-violet-400 scale-110" : "border-white/20"}`} style={{ background: c }} />
              ))}
              <input type="color" value={sub.color} onChange={(e) => setSub({ ...sub, color: e.target.value })} className="w-8 h-8 rounded bg-transparent" />
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-1.5">Font</div>
            <select value={sub.font} onChange={(e) => setSub({ ...sub, font: e.target.value })} className="w-full rounded-lg bg-zinc-950 border border-white/10 px-3 py-2 text-sm">
              {FONTS.map(([n, f]) => (
                <option key={n} value={f}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={sub.bold} onChange={(e) => setSub({ ...sub, bold: e.target.checked })} /> Bold</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={sub.outline} onChange={(e) => setSub({ ...sub, outline: e.target.checked })} /> Outline / shadow</label>
          </div>
          <button onClick={() => setSub(DEFAULT_SUB)} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs">Reset style</button>
        </Card>
        <div className="text-xs text-zinc-500 leading-relaxed px-1">
          Shortcuts in the player: <b>C</b> toggle subs · <b>G / H</b> delay −/+ 0.5s · <b>Space</b> play/pause · <b>← →</b> seek · <b>F</b> fullscreen · <b>N / P</b> next/prev · <b>&lt; &gt;</b> speed
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}
function Row({ children, active, onClick, onRemove }: { children: React.ReactNode; active: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <div className={`flex items-center rounded-lg ${active ? "bg-violet-500/20 ring-1 ring-violet-500/50" : "bg-zinc-800/50 hover:bg-zinc-800"}`}>
      <button onClick={onClick} className="flex-1 text-left px-3 py-2 text-sm truncate">{active ? "● " : "○ "}{children}</button>
      {onRemove && <button onClick={onRemove} className="px-3 text-zinc-500 hover:text-red-400">✕</button>}
    </div>
  );
}
function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-200">{Number(value.toFixed(2))}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-violet-500" />
    </div>
  );
}
