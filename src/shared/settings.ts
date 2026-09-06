import type { UserAlias } from './types';

export type AiMode = 'aus' | 'unsicher' | 'immer';
export type AiPreset = 'schnell' | 'gruendlich' | 'benutzerdefiniert';

export interface AiPresetDef {
  id: AiPreset;
  label: string;
  model: string;
  /** Preis in USD pro Million Tokens (Eingabe, Ausgabe) – Fallback, wenn OpenRouter nicht erreichbar */
  pricePerMTokens: [number, number];
  description: string;
}

export const AI_PRESETS: AiPresetDef[] = [
  {
    id: 'schnell',
    label: 'Schnell',
    model: 'google/gemini-2.5-flash-lite',
    pricePerMTokens: [0.1, 0.4],
    description: 'Günstiges Vision-Modell über OpenRouter. Reicht für gedruckte Überschriften.',
  },
  {
    id: 'gruendlich',
    label: 'Gründlich',
    model: 'openai/gpt-5',
    pricePerMTokens: [1.25, 10],
    description: 'OpenAI-Modell über OpenRouter. Besser bei Handschrift und schlechten Kopien, etwa 15-mal teurer.',
  },
];

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Grobe Token-Annahme pro Seite (Kopfbereich als Bild + Prompt, JSON-Antwort). */
export const TOKENS_PER_PAGE = { input: 700, output: 60 };

export function estimateCostPer1000Pages(pricePerMTokens: [number, number]): number {
  const [pin, pout] = pricePerMTokens;
  return 1000 * ((TOKENS_PER_PAGE.input * pin + TOKENS_PER_PAGE.output * pout) / 1_000_000);
}

export interface Settings {
  aliases: UserAlias[];
  includeUnnumbered: boolean;
  workers: number;
  lastInputFolder?: string;
  lastOutputFolder?: string;
  /** Zuletzt geöffnete Ordner/Dateien, neueste zuerst */
  recentInputs: string[];
  /** Zuletzt gesuchte Stimmen */
  lastQueries: string[];
  ai: {
    mode: AiMode;
    preset: AiPreset;
    openrouterKey: string;
    /** Überschreibbare Modell-IDs der Voreinstellungen */
    presetModels: Record<'schnell' | 'gruendlich', string>;
    custom: { baseUrl: string; model: string; apiKey: string };
  };
}

export const DEFAULT_SETTINGS: Settings = {
  aliases: [],
  includeUnnumbered: true,
  workers: 0, // 0 = automatisch
  recentInputs: [],
  lastQueries: [],
  ai: {
    mode: 'aus',
    preset: 'schnell',
    openrouterKey: '',
    presetModels: { schnell: AI_PRESETS[0].model, gruendlich: AI_PRESETS[1].model },
    custom: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5vl', apiKey: '' },
  },
};

export function resolveAiEndpoint(s: Settings): { baseUrl: string; model: string; apiKey: string } {
  if (s.ai.preset === 'benutzerdefiniert') return { ...s.ai.custom };
  return { baseUrl: OPENROUTER_BASE_URL, model: s.ai.presetModels[s.ai.preset], apiKey: s.ai.openrouterKey };
}
