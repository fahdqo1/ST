import { useEffect, useState } from "react";

export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      if (!s) return initial;
      const parsed = JSON.parse(s);
      if (Array.isArray(initial) || typeof initial !== "object" || initial === null) return parsed as T;
      return { ...(initial as object), ...parsed } as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [key, v]);
  return [v, setV] as const;
}

export interface Progress {
  url: string;
  libId: string;
  idx: number;
  title: string;
  show: string;
  time: number;
  duration: number;
  updated: number;
  watched?: boolean;
}

export interface SubSettings {
  size: number; // px at 1080 reference -> we use vh-ish percentage
  color: string;
  bg: number; // opacity 0..1
  outline: boolean;
  bottom: number; // % from bottom
  delay: number; // seconds
  bold: boolean;
  font: string;
}

export const DEFAULT_SUB: SubSettings = {
  size: 4.2,
  color: "#ffffff",
  bg: 0.0,
  outline: true,
  bottom: 8,
  delay: 0,
  bold: true,
  font: "system-ui, sans-serif",
};

export interface AppSettings {
  serverBase: string;
  autoNext: boolean;
  autoResume: boolean;
  subLang: string;
  trackers: string;
  speed: number;
  volume: number;
  autoSubs: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  serverBase: "http://127.0.0.1:11470",
  autoNext: true,
  autoResume: true,
  subLang: "ara",
  trackers: "",
  speed: 1,
  volume: 1,
  autoSubs: true,
};
