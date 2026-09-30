// The ONE place the app talks to Gemini.
// - Inside Google AI Studio's preview, a key is injected, so we call Gemini directly.
// - On Vercel, no key exists in the browser, so we call our own /api/gemini function,
//   which holds the key on the server.
// Every feature (parse stock, forecast, transfers, citizen answers) must use callGemini().

import { GoogleGenAI } from '@google/genai';

export type GeminiRequest = {
  model: string;               // e.g. the default Flash model AI Studio chose
  contents: unknown;           // string | parts[] | [{ role, parts }]
  config?: Record<string, unknown>; // responseMimeType, responseSchema, systemInstruction, temperature...
};

function browserKey(): string | undefined {
  try {
    // AI Studio / Vite inject one of these at build time. On Vercel they will be undefined.
    // @ts-ignore
    return process.env.API_KEY || process.env.GEMINI_API_KEY || undefined;
  } catch {
    return undefined;
  }
}

export async function callGemini(req: GeminiRequest): Promise<string> {
  const key = browserKey();
  if (key) {
    const ai = new GoogleGenAI({ apiKey: key });
    const r = await ai.models.generateContent({
      model: req.model,
      contents: req.contents as any,
      config: req.config as any,
    });
    return r.text ?? '';
  }
  const r = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'AI request failed');
  return data.text as string;
}

// Helper for JSON responses: strips ```json fences if the model adds them.
export async function callGeminiJSON<T>(req: GeminiRequest): Promise<T> {
  const text = await callGemini({
    ...req,
    config: { responseMimeType: 'application/json', ...(req.config || {}) },
  });
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  return JSON.parse(clean) as T;
}
