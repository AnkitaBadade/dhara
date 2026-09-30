// Vercel serverless function: POST /api/gemini
// Holds the Gemini API key on the server so it never reaches the browser or GitHub.
// Vercel → Project → Settings → Environment Variables: GEMINI_API_KEY = <your key>

const ALLOWED_MODEL = /^gemini-[\w.-]+$/;
const FALLBACKS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  const key = process.env.GEMINI_API_KEY || process.env.SERVER_GEMINI_KEY;
  if (!key) {
    res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { model = 'gemini-3.8-flash', contents, config } = body;
    if (!ALLOWED_MODEL.test(model)) {
      res.status(400).json({ error: 'Unknown model' });
      return;
    }
    const { systemInstruction, ...generationConfig } = config || {};
    const payload = { contents: normalizeContents(contents), generationConfig };
    if (systemInstruction) {
      payload.systemInstruction =
        typeof systemInstruction === 'string'
          ? { parts: [{ text: systemInstruction }] }
          : systemInstruction;
    }
    // Try the requested model first; if Google says it is busy (429/5xx) or unavailable (404),
    // fall back to other Flash models so the demo keeps working.
    const chain = [model, ...FALLBACKS.filter((m) => m !== model)];
    let data = null;
    let lastStatus = 500;
    let lastError = 'Gemini error';
    for (const m of chain) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(payload),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        data = d;
        res.setHeader('x-dhara-model', m);
        break;
      }
      lastStatus = r.status;
      lastError = d?.error?.message || 'Gemini error';
      if (!RETRYABLE.has(r.status)) break; // e.g. 400 bad request: don't retry
    }
    if (!data) {
      res.status(lastStatus).json({ error: lastError });
      return;
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

// Accepts a string, an array of parts, or [{ role, parts }].
function normalizeContents(contents) {
  if (typeof contents === 'string') return [{ role: 'user', parts: [{ text: contents }] }];
  if (Array.isArray(contents) && contents.length && contents[0] && contents[0].parts) return contents;
  if (Array.isArray(contents)) {
    return [{ role: 'user', parts: contents.map((p) => (typeof p === 'string' ? { text: p } : p)) }];
  }
  return [{ role: 'user', parts: [{ text: String(contents ?? '') }] }];
}
