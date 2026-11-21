export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface SubTrack {
  id: string;
  label: string;
  lang?: string;
  url?: string;
  cues: Cue[];
}

function ts(s: string): number {
  const m = s.trim().replace(",", ".").match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return NaN;
  const ms = m[4] ? parseInt(m[4].padEnd(3, "0").slice(0, 3), 10) : 0;
  return (m[1] ? +m[1] : 0) * 3600 + +m[2] * 60 + +m[3] + ms / 1000;
}

export function parseSubs(raw: string): Cue[] {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, rest] = lines[i].split("-->");
    const start = ts(a);
    const end = ts(rest.trim().split(/\s+/)[0]);
    if (isNaN(start) || isNaN(end)) continue;
    const t = lines
      .slice(i + 1)
      .join("\n")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/<(?!\/?(i|b|u)\b)[^>]*>/gi, "")
      .trim();
    if (t) cues.push({ start, end, text: t });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export function decodeBuffer(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("\uFFFD")) return utf8;
  // try common legacy encodings (Arabic, Latin, ...)
  for (const enc of ["windows-1256", "windows-1252"]) {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      /* ignore */
    }
  }
  return utf8;
}

export async function loadSubsFromUrl(url: string, serverBase?: string): Promise<Cue[]> {
  const tries = [url];
  if (serverBase) tries.push(`${serverBase}/subtitles.vtt?from=${encodeURIComponent(url)}`);
  let err: unknown;
  for (const u of tries) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const cues = parseSubs(decodeBuffer(await r.arrayBuffer()));
      if (cues.length) return cues;
      throw new Error("No cues found in file");
    } catch (e) {
      err = e;
    }
  }
  throw err instanceof Error ? err : new Error("Failed to load subtitles");
}

export const LANG_NAMES: Record<string, string> = {
  ara: "Arabic", eng: "English", fre: "French", fra: "French", spa: "Spanish", ger: "German", deu: "German",
  ita: "Italian", por: "Portuguese", pob: "Portuguese (BR)", rus: "Russian", tur: "Turkish", per: "Persian",
  heb: "Hebrew", hin: "Hindi", jpn: "Japanese", kor: "Korean", chi: "Chinese", zho: "Chinese", dut: "Dutch",
  pol: "Polish", ind: "Indonesian", may: "Malay", swe: "Swedish", gre: "Greek", ell: "Greek", rum: "Romanian",
  vie: "Vietnamese", tha: "Thai", ukr: "Ukrainian", cze: "Czech", hun: "Hungarian", dan: "Danish", fin: "Finnish",
  nor: "Norwegian", bul: "Bulgarian", hrv: "Croatian", srp: "Serbian",
};

export interface RemoteSub {
  id: string;
  url: string;
  lang: string;
  label: string;
}

export async function searchSubs(imdb: string, kind: "series" | "movie", season: number | null, episode: number | null): Promise<RemoteSub[]> {
  const vid = kind === "series" && season !== null && episode !== null ? `${imdb}:${season}:${episode}` : kind === "series" && episode !== null ? `${imdb}:1:${episode}` : imdb;
  const r = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${kind}/${encodeURIComponent(vid).replace(/%3A/g, ":")}.json`);
  if (!r.ok) throw new Error(`Subtitle service error ${r.status}`);
  const j = await r.json();
  const counts: Record<string, number> = {};
  return ((j.subtitles || []) as { id: string; url: string; lang: string }[]).map((s) => {
    counts[s.lang] = (counts[s.lang] || 0) + 1;
    return { id: String(s.id), url: s.url, lang: s.lang, label: `${LANG_NAMES[s.lang] || s.lang} #${counts[s.lang]}` };
  });
}

export interface Meta {
  id: string;
  name: string;
  year?: string;
  poster?: string;
}

export async function searchCinemeta(q: string, kind: "series" | "movie"): Promise<Meta[]> {
  const r = await fetch(`https://v3-cinemeta.strem.io/catalog/${kind}/top/search=${encodeURIComponent(q)}.json`);
  if (!r.ok) throw new Error(`Search error ${r.status}`);
  const j = await r.json();
  return (j.metas || []).slice(0, 8).map((m: { imdb_id?: string; id: string; name: string; releaseInfo?: string; poster?: string }) => ({
    id: m.imdb_id || m.id,
    name: m.name,
    year: m.releaseInfo,
    poster: m.poster,
  }));
}
