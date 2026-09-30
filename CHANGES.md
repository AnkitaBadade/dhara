# Changes after the AI Studio export (30 Sep 2026)

1. **Register photo is now actually sent to Gemini** as an image (it was sent as a text description only). "Use sample register photo" loads `public/sample-register.jpg`.
2. **Voice notes are real**: recorded with the phone microphone (MediaRecorder, max 30 s) and sent to Gemini as audio; Gemini returns a transcript shown as the source. If the mic is blocked, a clear message asks the user to type instead.
3. **API key never reaches the browser**: removed the build-time key injection from `vite.config.ts`; the client always calls `/api/gemini`. Added `api/gemini.js` for Vercel.
4. **Honest metrics**: the "median report time" is computed from real, logged report times (was a fixed 14 s); missing AI confidence defaults to 0.6 so the line is flagged for checking (was an invented 0.88).
5. Build fixes: esbuild version conflict that broke `npm install`; two TypeScript errors; removed unused `sharp`, a temp script and duplicate 900 KB images. JavaScript bundle 985 KB → 618 KB (170 KB gzipped).
6. One model constant (`GEMINI_MODEL`) in `src/services/geminiClient.ts`.

## Final merge (30 Sep)
- Emergency surge: prompt now asks for exact dataset codes (PCM500, ORS, RL500…); incoming keys are normalised (PCM_500 → PCM500, ORS_SACH → ORS) so surges always reach the forecast.
- Listen buttons: fixed prop name (`textToRead`) so text-to-speech actually reads the label.
- Removed unused duplicate register images, bun.lock and tmp scripts.
