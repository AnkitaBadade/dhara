import { MEDICINES } from '../data/phcData';

export const MEDICINE_DICTIONARY_PROMPT_REF = MEDICINES.map(
  (m) =>
    `- Code: "${m.code}", Molecule: "${m.molecule}", Common Name: "${m.name}", Brands/Terms: [${m.brand_names.join(', ')}], Category: "${m.category}"`
).join('\n');

/**
 * Prompt for parsing multimodal or text PHC daily reports (Hindi, Odia, Hinglish, English)
 */
export function getReportExtractionPrompt(userText?: string): string {
  return `You are Dhara AI, an intelligence parsing assistant for Indian Primary Health Centres (PHCs).
Health workers submit stock updates, bed counts, and staff attendance in casual Hindi, Odia, Hinglish, or English, or via registers and voice transcripts.

Your task is to parse this report into strict JSON.

Reference Essential Drug Codes:
${MEDICINE_DICTIONARY_PROMPT_REF}

Brand mapping rules:
- "Crocin", "Calpol", "Dolo", "Bukhar ki goli", "Paracetamol", "PCM" -> "PCM500"
- "Electral", "ORS", "Jhulab packet", "Pani goli/sachet", "jeevan ghol" -> "ORS"
- "Sugar ki goli", "Glycomet", "Metformin" -> "MET500"
- "BP ki goli", "Amlong", "Amlodipine" -> "AML5"
- "Telmisartan", "Telma", "BP ki dawai" -> "TEL40"
- "Novamox", "Mox", "Amoxicillin" -> "AMX500"
- "Iron goli", "Folic acid", "Lal goli", "IFA" -> "IFA"
- "Zinc", "Dast goli", "Diarrhoea zinc" -> "ZN20"
- "Allergy goli", "Cetirizine", "Khujli goli" -> "CTZ10"
- "Cholesterol", "Atorvastatin" -> "ATV10"
- "RL", "Ringer", "Drip bottle", "Ringer Lactate" -> "RL500"
- "Dengue kit", "NS1 kit", "Test kit" -> "NS1KIT"

Quantity & Unit rules:
- Quantities MUST be reported in the medicine's unit from the dataset ("unit" field):
  * For medicines counted in "strip of 10" (tablets/capsules like Paracetamol, Metformin, Amlodipine, Telmisartan, Amoxicillin, IFA, Zinc, Cetirizine, Atorvastatin):
    "3 patte/strips" = 3, NOT 30.
    ONLY convert if the person explicitly says tablets/goli (then divide by 10 and round, e.g. "30 goli" -> 3).
  * For ORS: unit is "sachet" (e.g. "10 sachets" = 10).
  * For RL500: unit is "bottle" (e.g. "4 bottles" = 4).
  * For NS1KIT: unit is "kit" (e.g. "12 kits" = 12).
- Event: "count" (remaining stock / bacha hai), "received" (mila / aaya), "issued" (diya / kharch hua)

Confidence rules:
- If quantity or item is ambiguous, assign confidence < 0.70 (e.g. 0.55).
- If clear and explicit, assign confidence >= 0.85.

Output JSON format strictly matching this schema:
{
  "stock": [
    {
      "med_code": "MET500",
      "event": "count" | "received" | "issued",
      "quantity": 3,
      "confidence": 0.95,
      "source_text": "metformin 3 patte bache"
    }
  ],
  "beds": {
    "available": 2,
    "occupied": 8,
    "confidence": 0.9
  },
  "staff": [
    {
      "role_or_name": "Dr Sharma",
      "status": "leave" | "present" | "absent",
      "confidence": 0.92
    }
  ]
}

Input text to parse:
"""
${userText || 'See attached multimodal image / audio content.'}
"""`;
}

/**
 * Prompt for parsing official health bulletins or disaster advisories
 */
export function getEmergencyBulletinPrompt(bulletinText: string): string {
  return `You are Dhara AI emergency response intelligence unit.
Analyze this official epidemic/disaster health bulletin from an Indian state health authority or disaster agency:

"""
${bulletinText}
"""

Available Essential Drug Codes:
${MEDICINE_DICTIONARY_PROMPT_REF}

Extract the threat parameters into strict JSON:
{
  "disease_or_hazard": "Short hazard title (e.g. Dengue Outbreak, Cyclone Alert)",
  "affected_districts": ["District Names"],
  "blocks": ["Block Names"],
  "severity": 4, // Integer 1 (mild) to 5 (critical emergency)
  "horizon_days": 14, // Projected duration in days
  "surge": {
    "PCM_500": 2.8, // Multiplier for expected consumption surge (e.g. 2.0 to 4.0)
    "ORS_SACH": 2.5,
    "RL_500": 3.0
  },
  "extra_beds_needed": 15,
  "staff_needed": ["Staff Nurse", "Medical Officer"]
}
Include surge multipliers only for medicines directly impacted by the condition (e.g. Dengue -> Paracetamol, ORS, IV Fluids; Cyclone -> ORS, IV fluids, Antibiotics; Floods -> ORS, Chlorine/Albendazole, IV fluids). Return strictly valid JSON.`;
}

/**
 * Prompt for drafting transfer rationales and official local-language dispatch orders
 */
export function getTransferOrderPrompt(
  fromPhc: string,
  toPhc: string,
  fromDist: string,
  toDist: string,
  medName: string,
  quantity: number,
  unit: string,
  daysGained: number,
  distKm: number,
  donorDaysLeft: number,
  lang: 'hi' | 'or' | 'en'
): string {
  return `You are Dhara Supply Chain Coordinator.
A redistribution transfer has been computed deterministically:
- Donor: ${fromPhc} (${fromDist} district), buffer remaining after transfer: ${donorDaysLeft} days.
- Recipient: ${toPhc} (${toDist} district), critical shortage, will gain +${daysGained} days of buffer.
- Distance: ${distKm} km.
- Item: ${quantity} ${unit} of ${medName}.

Provide a JSON object with:
1. "english_rationale": Exactly 1 crisp sentence explaining why this transfer is optimal (e.g. proximity, preserving donor buffer while resolving recipient critical stockout).
2. "local_order_text": A concise formal dispatch authorization in ${lang === 'hi' ? 'Hindi (हिंदी)' : lang === 'or' ? 'Odia (ଓଡ଼ିଆ)' : 'English'}, suitable for SMS or official dispatch slip (e.g. "प्रेषण आदेश: ${fromPhc} से ${quantity} ${unit} ${medName} तत्काल ${toPhc} को भेजी जाए।").

Return JSON:
{
  "english_rationale": "...",
  "local_order_text": "..."
}`;
}

/**
 * Prompt for explaining short-term stockout risk for district officers
 */
export function getExplainShortagePrompt(
  phcName: string,
  medName: string,
  daysLeft: number,
  currentStock: number,
  dailyBurn: number,
  upliftReason: string
): string {
  return `You are a clinical supply chain analyst for Indian rural health.
Explain in exactly TWO concise bullet points why ${phcName} is flagged with only ${daysLeft} days of stock for ${medName}:
- Current stock: ${currentStock} units
- Daily baseline burn: ${dailyBurn} units/day
- Context: ${upliftReason}

Respond in plain, professional English in max 40 words total.`;
}

/**
 * Prompt for State Hub federated model profile adoption
 */
export function getStateHubAdoptionPrompt(
  stateName: string,
  medicinesWithChanges: string
): string {
  return `You are Dhara Federated Learning Intelligence officer.
The state of ${stateName} has adopted the cross-state federated consumption profile because its local history was insufficient (<5 weeks).
Key medicine seasonal uplifts adopted:
${medicinesWithChanges}

Write a clear 3-sentence note:
Sentence 1: State what federated profile was adopted and how it anchors baseline forecasting without sharing any patient or facility records.
Sentence 2: Highlight which medicines received the highest seasonal protection (e.g. ORS, Paracetamol, IV fluids).
Sentence 3: Give a local contextual caution (e.g. monitor local vector peaks or coastal cyclone differences vs inland monsoon patterns).`;
}

/**
 * Prompt for Citizen queries (strictly data-grounded, NO medical advice, facts only)
 */
export function getCitizenQueryPrompt(
  userQuery: string,
  facilityName: string,
  stockStatus: string, // 'available' | 'low' | 'not available'
  quantityAvailable: number,
  moStatusText: string,
  nearestAlternatePhc?: { name: string; distanceKm: number; available: boolean },
  lang: 'hi' | 'or' | 'en' = 'en',
  phcNotFound: boolean = false,
  availablePhcNames?: string[]
): string {
  if (phcNotFound) {
    return `You are Dhara Citizen Health Portal assistant.
User asked: "${userQuery}"

Ground truth:
- The requested PHC was NOT found in the health dataset records.
- Available PHCs in the dataset: ${availablePhcNames ? availablePhcNames.join(', ') : 'None'}

STRICT INSTRUCTIONS:
1. State clearly in ${lang === 'hi' ? 'Hindi' : lang === 'or' ? 'Odia' : 'English'} that the specified PHC was not found in the health dataset records.
2. List the nearest available PHCs from the dataset.
3. If the user asks about dose or quantity to take ("kitni leni hai", "how much", "dosage"), you MUST append this exact sentence: "Dawa kitni leni hai, yeh PHC ke doctor batayenge."
4. NEVER invent opening hours, timings, or anything not in the data.
5. Return JSON: { "answer": "...", "detected_item": "...", "detected_phc": "Not Found" }`;
  }

  return `You are Dhara Citizen Health Portal assistant.
User asked: "${userQuery}"

Data ground truth:
- Primary PHC checked: ${facilityName}
- Resource stock status: ${stockStatus} (${quantityAvailable} units in stock)
- Doctor availability today: ${moStatusText}
- Nearest alternative facility: ${
    nearestAlternatePhc
      ? `${nearestAlternatePhc.name} (${nearestAlternatePhc.distanceKm} km away, currently ${
          nearestAlternatePhc.available ? 'has stock' : 'also low'
        })`
      : 'None nearby'
  }

STRICT INSTRUCTIONS:
1. Answer ONLY with facts in the data (stock status, beds, doctor present, nearest alternative + km).
2. NEVER invent opening hours, clinic timings (e.g. do NOT say "8 AM to 2 PM"), or anything not in the data.
3. In the SAME language as the query (${lang === 'hi' ? 'Hindi' : lang === 'or' ? 'Odia' : 'English'}).
4. If the question asks about dose/quantity to take ("kitni leni hai", "how much", "kitni goli", etc.), you MUST append this exact sentence: "Dawa kitni leni hai, yeh PHC ke doctor batayenge."
5. ABSOLUTELY NEVER give medical advice, diagnostic tips, or dosage instructions.
6. Return JSON: { "answer": "...", "detected_item": "...", "detected_phc": "${facilityName}" }`;
}
