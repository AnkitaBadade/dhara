# Dhara (धारा) — keeping PHC resources flowing

**Build with AI: Code for Communities, Second Edition · Track 03: Smart Health & Supply Chain Resilience**

Dhara is a federated AI platform for India's Primary Health Centres. PHC staff report medicine stock, free beds and who is on duty the way they already work (a photo of the paper register, a voice note or a text in Hindi, Odia or English) and Gemini turns it into live, structured data. District officers get season- and emergency-adjusted forecasts, early warnings, and automated cross-district transfers of medicines, staff cover and bed referrals. States learn demand profiles from their own data and share only the models. Citizens can check availability before they travel.

**Live demo:** <vercel link> · **Demo video:** <youtube link> · **Deck:** <link>

## Coverage of the problem statement
| The brief asks for | Dhara |
|---|---|
| Real-time visibility of medicine stock | Photo/voice/text capture → stock grid and map |
| Bed availability | Same capture + bed counter → beds layer, bed referrals |
| Medical personnel attendance | Geofenced check-in + voice roll call → staff layer, "no MO today" alerts |
| Demand forecasting | Days of stock × learned seasonal uplift, explained by Gemini |
| Early warnings during health emergencies | Gemini reads an outbreak or weather bulletin → surge profile → warnings |
| Automated cross-district redistribution | Transfer engine across districts; small transfers auto-dispatched, large ones approved |
| Shared predictive modelling across states | State Hub: per-state profiles, facility-weighted federated profile, raw data stays in-state |

## How Google AI is used
Gemini (multimodal) parses register photos, voice notes and text in Indian languages into structured events; reads health bulletins into surge profiles; ranks transfer options and drafts orders in the local language; explains forecasts; and answers citizens from the data only. A person confirms low-confidence captures; stock maths is deterministic.

## Run locally
```bash
npm install
echo "GEMINI_API_KEY=your_key" > .env   # local only; .env is git-ignored
npm run dev                             # http://localhost:3000
```

## Deploy (Vercel, free)
Import this repo in Vercel and add the environment variable `GEMINI_API_KEY`. The browser never holds the key: every AI call goes to `/api/gemini` (`api/gemini.js` on Vercel, `server.ts` locally), which adds the key on the server.

## Data
All operational data is **synthetic**. PHC names are real places in Haryana (Faridabad, Palwal, Nuh) and Odisha (Khordha, Puri), with approximate coordinates. Medicines are keyed by molecule following India's National List of Essential Medicines. National context: 31,882 PHCs and 40,583 doctors at PHCs (MoHFW, Health Dynamics of India 2022-23, as of 31 Mar 2023).

## Production path
Cloud Run · BigQuery (national history) · Vertex AI forecasting · Firebase (offline sync) · Cloud Speech-to-Text and Translation for more languages · integration with state drug-distribution and HR systems via API · one project per state for data sovereignty.

## Design approach
Built from field research (expert interview and doctors at AIIMS Ballabhgarh, 7 patient interviews) and published studies. Visual system follows the Government of India's UX4G design system and targets WCAG 2.1 AA / GIGW 3.0. Designed mobile-first for 360×800 Android phones and 1366×768 office laptops. No official emblems or government branding: this is a prototype.

## Credits
Built with Google AI Studio and the Gemini API (Gemini powers every AI feature). Code refined with AI coding assistance. Map: Leaflet + OpenStreetMap contributors (BSD-2 / ODbL). Fonts: Noto (OFL). Icons: Lucide (ISC).
