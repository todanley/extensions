import { getPreferenceValues } from "@raycast/api";
import { DEFAULTS, type AnalyzeOptions } from "./engine";
import { type Caps, capsFromArgs } from "./tools";

export interface Preferences {
  maxCharsEn: string;
  maxCharsCjk: string;
  maxCpsEn: string;
  maxCpsCjk: string;
}

function parsePositive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function capsFromPreferences(prefs?: Preferences): Caps {
  const values = prefs ?? getPreferenceValues<Preferences>();
  return capsFromArgs({
    maxCharsEn: parsePositive(values.maxCharsEn, DEFAULTS.maxEn),
    maxCharsCjk: parsePositive(values.maxCharsCjk, DEFAULTS.maxCjk),
    maxCpsEn: parsePositive(values.maxCpsEn, DEFAULTS.cpsEn),
    maxCpsCjk: parsePositive(values.maxCpsCjk, DEFAULTS.cpsCjk),
  });
}

export type { AnalyzeOptions };
