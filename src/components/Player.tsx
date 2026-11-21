import { useCallback, useEffect, useRef, useState } from "react";
import type { Cue, SubTrack } from "../lib/subs";
import type { AppSettings, SubSettings } from "../lib/storage";

interface Props {
  url: string;
  title: string;
  subtitle: string;
  startAt: number;
  settings: AppSettings;
  sub: SubSettings;
  setSub: (s: SubSettings) => void;
  tracks: SubTrack[];
  activeTrack: string | null;
  setActiveTrack: (id: string | null) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
  onProgress: (time: number, duration: number) => void;
  onOpenSubs: () => void;
  onSpeed: (n: number) => void;
  onVolume: (n: number) => void;
}

const fmt = (t: number) => {
  if (!isFinite(t)) return "0:00";
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
};

function findCue(cues: Cue[], t: number): Cue[] {
  const out: Cue[] = [];
  // cues sorted by start; simple scan near t
  let lo = 0,
    hi = cues.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cues[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  for (let i = Math.max(0, lo - 4); i <= Math.min(cues.length - 1, lo + 1); i++) {
    if (cues[i].start <= t && cues[i].end >= t) out.push(cues[i]);
  }
  return out;
}

export default function Player(p: Props) {
  const vref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hideT = useRef<number | undefined>(undefined);
  const lastSave = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ui, setUi] = useState(true);
  const [menu, setMenu] = useState<null | "cc" | "speed">(null);
  const [full, setFull] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [boxH, setBoxH] = useState(400);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight));
    ro.observe(el);
    setBoxH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const track = p.tracks.find((t) => t.id === p.activeTrack) || null;

  const say = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout((say as unknown as { t?: number }).t);
    (say as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 1400);
  }, []);

  // load new source
  useEffect(() => {
    setErr(null);
    setLoading(true);
    setCur(0);
    setDur(0);
    setPlaying(false);
  }, [p.url]);

  useEffect(() => {
    const v = vref.current;
    if (v) {
      v.playbackRate = p.settings.speed;
      v.volume = p.settings.volume;
    }
  }, [p.settings.speed, p.settings.volume, p.url]);

  // subtitle ticker
  useEffect(() => {
    if (!track) {
      setLines([]);
      return;
    }
    const id = window.setInterval(() => {
      const v = vref.current;
      if (!v) return;
      const t = v.currentTime - p.sub.delay;
      const found = findCue(track.cues, t).map((c) => c.text);
      setLines((old) => (old.join("|") === found.join("|") ? old : found));
    }, 100);
    return () => clearInterval(id);
  }, [track, p.sub.delay]);

  const save = useCallback(
    (force = false) => {
      const v = vref.current;
      if (!v || !v.duration) return;
      const now = Date.now();
      if (!force && now - lastSave.current < 4000) return;
      lastSave.current = now;
      p.onProgress(v.currentTime, v.duration);
    },
    [p]
  );

  useEffect(() => {
    return () => {
      const v = vref.current;
      if (v && v.duration && v.currentTime > 1) p.onProgress(v.currentTime, v.duration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.url]);

  useEffect(() => {
    const h = () => {
      const v = vref.current;
      if (v && v.duration) p.onProgress(v.currentTime, v.duration);
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  });

  const toggle = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = useCallback(
    (d: number) => {
      const v = vref.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + d));
      say(`${d > 0 ? "+" : ""}${d}s`);
    },
    [say]
  );

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const wake = () => {
    setUi(true);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => {
      if (vref.current && !vref.current.paused) {
        setUi(false);
        setMenu(null);
      }
    }, 3000);
  };

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const v = vref.current;
      if (!v) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(e.shiftKey ? 30 : 10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(e.shiftKey ? -30 : -10);
          break;
        case "ArrowUp":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.05);
          p.onVolume(v.volume);
          say(`Volume ${Math.round(v.volume * 100)}%`);
          break;
        case "ArrowDown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.05);
          p.onVolume(v.volume);
          say(`Volume ${Math.round(v.volume * 100)}%`);
          break;
        case "f":
          toggleFull();
          break;
        case "m":
          v.muted = !v.muted;
          say(v.muted ? "Muted" : "Unmuted");
          break;
        case "c":
          if (p.activeTrack) {
            p.setActiveTrack(null);
            say("Subtitles off");
          } else if (p.tracks[0]) {
            p.setActiveTrack(p.tracks[0].id);
            say("Subtitles on");
          } else p.onOpenSubs();
          break;
        case "g": {
          const d = Math.round((p.sub.delay - 0.5) * 10) / 10;
          p.setSub({ ...p.sub, delay: d });
          say(`Subtitle delay ${d}s`);
          break;
        }
        case "h": {
          const d = Math.round((p.sub.delay + 0.5) * 10) / 10;
          p.setSub({ ...p.sub, delay: d });
          say(`Subtitle delay ${d}s`);
          break;
        }
        case "n":
          if (p.hasNext) p.onNext();
          break;
        case "p":
          if (p.hasPrev) p.onPrev();
          break;
        case ">": {
          const s = Math.min(3, Math.round((v.playbackRate + 0.25) * 100) / 100);
          p.onSpeed(s);
          say(`Speed ${s}x`);
          break;
        }
        case "<": {
          const s = Math.max(0.25, Math.round((v.playbackRate - 0.25) * 100) / 100);
          p.onSpeed(s);
          say(`Speed ${s}x`);
          break;
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div
      ref={wrap}
      onMouseMove={wake}
      onMouseLeave={() => playing && setUi(false)}
      className={`relative bg-black w-full overflow-hidden select-none ${full ? "h-screen" : "aspect-video rounded-xl shadow-2xl shadow-black/60"} ${ui ? "" : "cursor-none"}`}
    >
      <video
        ref={vref}
        src={p.url}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full bg-black"
        onClick={() => {
          if (menu) setMenu(null);
          else toggle();
        }}
        onDoubleClick={toggleFull}
        onPlay={() => {
          setPlaying(true);
          wake();
        }}
        onPause={() => {
          setPlaying(false);
          setUi(true);
          save(true);
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDur(v.duration);
          v.playbackRate = p.settings.speed;
          v.volume = p.settings.volume;
          if (p.settings.autoResume && p.startAt > 5 && p.startAt < v.duration - 30) {
            v.currentTime = p.startAt;
            say(`Resumed at ${fmt(p.startAt)}`);
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCur(v.currentTime);
          if (v.buffered.length) {
            for (let i = 0; i < v.buffered.length; i++)
              if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) setBuffered(v.buffered.end(i));
          }
          save();
        }}
        onEnded={() => {
          save(true);
          p.onEnded();
        }}
        onError={() => {
          const c = vref.current?.error;
          setLoading(false);
          setErr(
            c?.code === 4
              ? "The browser can't play this file (format/codec not supported, or the Stremio server is not reachable). Make sure Stremio is running. MKV with HEVC/AC3/DTS often isn't supported by browsers — try Chrome/Edge, or copy the link and open it in VLC."
              : "Playback error. Check that Stremio is open and the torrent is available."
          );
        }}
      />

      {/* Subtitles overlay */}
      {track && lines.length > 0 && (
        <div
          className="absolute left-0 right-0 flex justify-center px-[6%] pointer-events-none text-center"
          style={{ bottom: `${p.sub.bottom + (ui ? 6 : 0)}%`, transition: "bottom .2s" }}
        >
          <div
            dir="auto"
            style={{
              fontSize: `${Math.max(12, (boxH * p.sub.size) / 100)}px`,
              color: p.sub.color,
              fontWeight: p.sub.bold ? 700 : 400,
              fontFamily: p.sub.font,
              lineHeight: 1.25,
              textShadow: p.sub.outline ? "0 0 4px #000, 0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000" : "none",
              background: `rgba(0,0,0,${p.sub.bg})`,
              padding: p.sub.bg > 0 ? "0.1em 0.5em" : 0,
              borderRadius: 6,
              whiteSpace: "pre-line",
            }}
            dangerouslySetInnerHTML={{
              __html: lines
                .join("\n")
                .replace(/&/g, "&amp;")
                .replace(/<(?!\/?(i|b|u)>)/g, "&lt;"),
            }}
          />
        </div>
      )}

      {/* spinner */}
      {loading && !err && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-violet-400 animate-spin" />
        </div>
      )}

      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur px-4 py-1.5 rounded-full text-sm text-white pointer-events-none">
          {toast}
        </div>
      )}

      {err && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
          <div className="max-w-md">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-zinc-300 mb-4">{err}</p>
            <div className="flex gap-2 justify-center">
              <button
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm"
                onClick={() => {
                  setErr(null);
                  setLoading(true);
                  vref.current?.load();
                }}
              >
                Retry
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm"
                onClick={() => navigator.clipboard?.writeText(p.url)}
              >
                Copy link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* big play when paused */}
      {!playing && !loading && !err && (
        <button onClick={toggle} className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center text-4xl text-white">
          ▶
        </button>
      )}

      {/* controls */}
      <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${ui ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-3 px-4">
          <div
            className="relative h-5 flex items-center cursor-pointer group"
            onClick={(e) => {
              const v = vref.current;
              if (v && dur) v.currentTime = seekFromEvent(e);
            }}
            onMouseMove={(e) => setHover(seekFromEvent(e))}
            onMouseLeave={() => setHover(null)}
          >
            <div className="w-full h-1.5 group-hover:h-2.5 transition-all rounded-full bg-white/20 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
              <div className="absolute inset-y-0 left-0 bg-violet-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="absolute w-3.5 h-3.5 rounded-full bg-white shadow -translate-x-1/2" style={{ left: `${pct}%` }} />
            {hover !== null && (
              <div className="absolute -top-6 -translate-x-1/2 text-xs bg-black/80 px-2 py-0.5 rounded" style={{ left: `${dur ? (hover / dur) * 100 : 0}%` }}>
                {fmt(hover)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-white mt-1">
            <Btn onClick={p.onPrev} disabled={!p.hasPrev} title="Previous (P)">⏮</Btn>
            <Btn onClick={() => seekBy(-10)} title="-10s">⏪</Btn>
            <Btn onClick={toggle} title="Play/Pause (Space)" big>{playing ? "⏸" : "▶"}</Btn>
            <Btn onClick={() => seekBy(10)} title="+10s">⏩</Btn>
            <Btn onClick={p.onNext} disabled={!p.hasNext} title="Next (N)">⏭</Btn>
            <span className="text-xs sm:text-sm tabular-nums ml-1 text-zinc-300">
              {fmt(cur)} / {fmt(dur)}
            </span>
            <div className="flex-1 min-w-0 px-3 hidden md:block text-center truncate text-sm text-zinc-200">{p.title}</div>
            <div className="flex-1 md:hidden" />
            <div className="relative">
              <Btn onClick={() => setMenu(menu === "speed" ? null : "speed")} title="Speed">
                <span className="text-xs font-semibold">{p.settings.speed}x</span>
              </Btn>
              {menu === "speed" && (
                <Pop>
                  {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((s) => (
                    <Item key={s} active={s === p.settings.speed} onClick={() => { p.onSpeed(s); setMenu(null); }}>
                      {s}x
                    </Item>
                  ))}
                </Pop>
              )}
            </div>
            <div className="relative">
              <Btn onClick={() => setMenu(menu === "cc" ? null : "cc")} title="Subtitles (C)">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${track ? "bg-violet-600 border-violet-400" : "border-white/50"}`}>CC</span>
              </Btn>
              {menu === "cc" && (
                <Pop wide>
                  <Item active={!p.activeTrack} onClick={() => { p.setActiveTrack(null); setMenu(null); }}>Off</Item>
                  {p.tracks.map((t) => (
                    <Item key={t.id} active={t.id === p.activeTrack} onClick={() => { p.setActiveTrack(t.id); setMenu(null); }}>
                      {t.label}
                    </Item>
                  ))}
                  <div className="border-t border-white/10 mt-1 pt-1 px-2 py-1.5 flex items-center justify-between text-xs text-zinc-300">
                    <span>Delay</span>
                    <span className="flex items-center gap-1">
                      <button className="w-6 h-6 rounded bg-white/10 hover:bg-white/20" onClick={() => p.setSub({ ...p.sub, delay: Math.round((p.sub.delay - 0.5) * 10) / 10 })}>−</button>
                      <span className="w-12 text-center tabular-nums">{p.sub.delay.toFixed(1)}s</span>
                      <button className="w-6 h-6 rounded bg-white/10 hover:bg-white/20" onClick={() => p.setSub({ ...p.sub, delay: Math.round((p.sub.delay + 0.5) * 10) / 10 })}>+</button>
                    </span>
                  </div>
                  <Item onClick={() => { setMenu(null); p.onOpenSubs(); }}>⚙ Find / customize…</Item>
                </Pop>
              )}
            </div>
            <Btn onClick={toggleFull} title="Fullscreen (F)">{full ? "🗗" : "⛶"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, title, big }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; big?: boolean }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-9 min-w-9 px-1.5 rounded-lg hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center ${big ? "text-2xl" : "text-lg"}`}
    >
      {children}
    </button>
  );
}
function Pop({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`absolute bottom-12 right-0 ${wide ? "w-64" : "w-24"} max-h-72 overflow-auto bg-zinc-900/95 backdrop-blur border border-white/10 rounded-xl p-1 shadow-xl text-sm`}>
      {children}
    </div>
  );
}
function Item({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 truncate ${active ? "text-violet-300 font-semibold" : "text-zinc-200"}`}>
      {active && "✓ "}
      {children}
    </button>
  );
}
