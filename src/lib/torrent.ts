export interface Episode {
  idx: number;
  fileName: string;
  title: string;
  season: number | null;
  episode: number | null;
  size: number;
  url: string;
}

export interface LibraryItem {
  id: string; // infoHash
  name: string;
  base: string;
  kind: "series" | "movie";
  imdb?: string;
  addedAt: number;
  episodes: Episode[];
}

export interface ParsedLink {
  base: string | null;
  hash: string;
  idx: number | null;
}

const HASH_RE = /\b([a-fA-F0-9]{40})\b/;

export function parseLink(input: string): ParsedLink | null {
  const text = input.trim();
  if (!text) return null;
  const magnet = text.match(/btih:([a-zA-Z0-9]{32,40})/i);
  if (magnet && /^magnet:/i.test(text)) return { base: null, hash: magnet[1].toLowerCase(), idx: null };
  const m = text.match(/^(https?:\/\/[^\/\s]+)\/([a-fA-F0-9]{40})(?:\/(-?\d+))?/);
  if (m) return { base: m[1], hash: m[2].toLowerCase(), idx: m[3] !== undefined ? parseInt(m[3], 10) : null };
  const h = text.match(HASH_RE);
  if (h) return { base: null, hash: h[1].toLowerCase(), idx: null };
  return null;
}

const VIDEO_EXT = /\.(mkv|mp4|avi|m4v|mov|webm|ts|wmv|flv|mpg|mpeg|m2ts)$/i;
export const isVideo = (n: string) => VIDEO_EXT.test(n);

export function formatSize(b: number) {
  if (!b) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(b >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function clean(s: string) {
  return s
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[._]+/g, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(2160p|1080p|720p|480p|4k|x264|x265|h264|h265|hevc|bluray|brrip|bdrip|web-?dl|webrip|hdtv|aac|ac3|dts|10bit|remux|proper|repack|multi|dual)\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseName(fileName: string): { title: string; season: number | null; episode: number | null } {
  const base = fileName.split("/").pop() || fileName;
  const folder = fileName.includes("/") ? fileName.split("/").slice(-2, -1)[0] : "";
  let season: number | null = null;
  let episode: number | null = null;
  let rest = base;

  let m = base.match(/[Ss](\d{1,2})[\s._-]*[Ee](\d{1,4})(?:[-Ee]+\d+)?/);
  if (m) {
    season = +m[1];
    episode = +m[2];
    rest = base.slice((m.index ?? 0) + m[0].length);
  } else if ((m = base.match(/(?:^|[\s._\-\[(])(\d{1,2})x(\d{2,3})(?!\d|p)/i))) {
    season = +m[1];
    episode = +m[2];
    rest = base.slice((m.index ?? 0) + m[0].length);
  } else if ((m = base.match(/(?:season|series)[\s._-]*(\d{1,2}).{0,10}?(?:episode|ep|e)[\s._-]*(\d{1,4})/i))) {
    season = +m[1];
    episode = +m[2];
    rest = base.slice((m.index ?? 0) + m[0].length);
  } else if ((m = base.match(/(?:episode|ep|e|حلقة|الحلقة)[\s._-]*(\d{1,4})/i))) {
    episode = +m[1];
    rest = base.slice((m.index ?? 0) + m[0].length);
  } else if (
    (m = base.match(/(?:^|[\s._\]\)])-\s*(\d{1,4})(?:v\d)?(?=[\s._\[(]|$)/)) ||
    (m = base.match(/^\[[^\]]+\][^\[\d]*?(\d{1,4})(?=[\s._\[(])/)) ||
    (m = base.match(/^(\d{1,4})[\s._-]/))
  ) {
    episode = +m[1];
    rest = base.slice((m.index ?? 0) + m[0].length);
  }

  const cleanedRest = clean(rest).replace(/^[-–:\s]+/, "");
  let title = "";
  if (episode !== null) {
    const label = season !== null ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}` : `Episode ${episode}`;
    // title after episode marker only if it looks like a real episode name
    title = cleanedRest && cleanedRest.length > 1 && !/^\d+$/.test(cleanedRest) ? `${label} – ${cleanedRest}` : label;
  } else {
    title = clean(base) || base;
    if (folder && title.length < 3) title = clean(folder);
  }
  return { title, season, episode };
}

export function guessShowName(torrentName: string) {
  const n = clean(torrentName)
    .replace(/\b[Ss]\d{1,2}([Ee]\d+)?\b.*$/, "")
    .replace(/\b(season|complete|series|collection)\b.*$/i, "")
    .replace(/\b(19|20)\d{2}\b.*$/, "")
    .trim();
  return n || torrentName;
}

export async function fetchTorrentFiles(
  base: string,
  hash: string,
  trackers: string[] = []
): Promise<{ name: string; files: { name: string; length: number }[] }> {
  // Ask the Stremio server to create/load the torrent engine
  try {
    await fetch(`${base}/${hash}/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        torrent: { infoHash: hash },
        peerSearch: { sources: [`dht:${hash}`, ...trackers.map((t) => `tracker:${t}`)], min: 40, max: 200 },
      }),
    });
  } catch {
    /* continue, maybe engine already exists */
  }
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const r = await fetch(`${base}/${hash}/stats.json`);
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.files) && j.files.length) {
          return {
            name: j.name || j.infoHash || hash,
            files: j.files.map((f: { name?: string; path?: string; length?: number }) => ({
              name: f.path || f.name || "",
              length: f.length || 0,
            })),
          };
        }
      }
    } catch (e) {
      lastErr = e;
      if (attempt === 0) break; // network failure: server not reachable
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw lastErr instanceof Error ? lastErr : new Error("Could not read file list (torrent metadata not found yet).");
}

export function buildEpisodes(base: string, hash: string, files: { name: string; length: number }[]): Episode[] {
  const eps: Episode[] = [];
  files.forEach((f, idx) => {
    if (!isVideo(f.name)) return;
    if (/sample/i.test(f.name) && f.length < 100 * 1024 * 1024) return;
    const p = parseName(f.name);
    eps.push({
      idx,
      fileName: f.name,
      title: p.title,
      season: p.season,
      episode: p.episode,
      size: f.length,
      url: `${base}/${hash}/${idx}`,
    });
  });
  eps.sort((a, b) => {
    const sa = a.season ?? 0,
      sb = b.season ?? 0;
    if (sa !== sb) return sa - sb;
    if (a.episode !== null && b.episode !== null && a.episode !== b.episode) return a.episode - b.episode;
    return a.fileName.localeCompare(b.fileName, undefined, { numeric: true });
  });
  return eps;
}
