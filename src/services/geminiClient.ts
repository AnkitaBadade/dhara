// The ONE place the app talks to Gemini.
// The browser never holds an API key. Every call goes to our own server route
// POST /api/gemini, which adds the key on the server:
//   - in Google AI Studio: server.ts (Express)
//   - on Vercel: api/gemini.js (serverless function)

export const GEMINI_MODEL = 'gemini-3.8-flash';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiRequest = {
  model?: string;
  contents: string | GeminiPart[] | Array<{ role: string; parts: GeminiPart[] }>;
  config?: Record<string, unknown>;
};

const TIMEOUT_MS = 20000;

export async function callGemini(req: GeminiRequest): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, model: req.model || GEMINI_MODEL }),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `AI request failed (${r.status})`);
    return (data.text as string) || '';
  } finally {
    clearTimeout(timer);
  }
}

// JSON responses: strips ```json fences if the model adds them.
export async function callGeminiJSON<T>(req: GeminiRequest): Promise<T> {
  const text = await callGemini({
    ...req,
    config: { responseMimeType: 'application/json', ...(req.config || {}) },
  });
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  return JSON.parse(clean) as T;
}

// "data:image/jpeg;base64,AAAA" -> { mimeType, data }
export function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  return m ? { mimeType: m[1], data: m[2] } : null;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
