import type { AiClassifyRequest, AiClassifyResponse } from '@shared/ipc-types';
import { resolveAiEndpoint, type Settings } from '@shared/settings';

const SYSTEM_PROMPT = `Du liest den Kopfbereich einer gescannten Notenseite aus der Blasmusik.
Bestimme, für welche Stimme (Instrument) diese Seite ist. Antworte NUR mit einem JSON-Objekt:
{"headerText": "<die Stimmenbezeichnung wörtlich, wie sie auf dem Blatt steht, oder leer>",
 "instrument": "<Instrument auf Deutsch, z.B. Trompete, Flügelhorn, Tenorhorn, Bariton, Posaune, Tuba, Horn, Klarinette, Schlagzeug, Flöte, Saxophon, Gitarre, Gesang; oder 'Stimme' bei generischen Angaben wie '1. Stimme'; oder leer>",
 "number": "<Stimmnummer als Ziffer, z.B. 1, 2, 1/2, oder leer>",
 "key": "<Stimmung wie B, Es, F, C oder leer>",
 "isScore": <true wenn es eine Partitur/Direktion ist (mehrere Instrumente untereinander in einem System), sonst false>}
Titel des Stücks, Komponist, Arrangeur und Verlag sind KEINE Stimmenbezeichnung. Wenn keine Stimmenbezeichnung erkennbar ist, lass die Felder leer.`;

function parseJson(text: string): Partial<AiClassifyResponse> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function aiClassify(req: AiClassifyRequest, settings: Settings): Promise<AiClassifyResponse> {
  const { baseUrl, model, apiKey } = resolveAiEndpoint(settings);
  if (!baseUrl || !model) return { ok: false, error: 'KI-Anbindung ist nicht konfiguriert.' };
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://github.com/dominik/stimmenauszug';
    headers['X-Title'] = 'Stimmenauszug';
  }
  const userText = req.ocrText
    ? `Lokale OCR hat gelesen (kann fehlerhaft sein): "${req.ocrText.slice(0, 300)}"`
    : 'Bitte den Kopfbereich lesen.';
  const body: Record<string, unknown> = {
    model,
    max_tokens: 300,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: req.imageDataUrl } },
        ],
      },
    ],
  };
  if (/gpt-5|o[1-4]|reasoning|thinking/i.test(model)) {
    body.reasoning = { effort: 'low' };
    delete body.temperature;
    delete body.max_tokens;
    body.max_completion_tokens = 1500;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    const json = JSON.parse(text);
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const parsed = parseJson(typeof content === 'string' ? content : JSON.stringify(content));
    if (!parsed) return { ok: false, error: 'Antwort enthielt kein JSON: ' + String(content).slice(0, 200) };
    return {
      ok: true,
      headerText: parsed.headerText ?? '',
      instrument: parsed.instrument ?? '',
      number: parsed.number !== undefined && parsed.number !== null ? String(parsed.number) : '',
      key: parsed.key ?? '',
      isScore: !!parsed.isScore,
      usage: json.usage
        ? { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 }
        : undefined,
      model: json.model ?? model,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Holt aktuelle Preise (USD pro Token) von OpenRouter für die Voreinstellungen. */
export async function fetchOpenRouterPricing(models: string[]): Promise<Record<string, [number, number]>> {
  const out: Record<string, [number, number]> = {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return out;
    const json = await res.json();
    for (const m of json.data ?? []) {
      if (models.includes(m.id) && m.pricing) {
        out[m.id] = [Number(m.pricing.prompt) * 1e6, Number(m.pricing.completion) * 1e6];
      }
    }
  } catch {
    /* offline: Fallback-Preise */
  }
  return out;
}
