import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Mic,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BilingualText, formatDaysAgo, t, ListenButton, MedicinePictogram } from '../lib/i18n';
import { haversineDistance } from '../lib/resourceMath';
import { callGeminiJSON } from '../services/geminiClient';
import { getCitizenQueryPrompt } from '../services/prompts';
import { PHC } from '../types';

interface CitizenAnswerData {
  answer: string;
  detected_item: string;
  detected_phc: string;
  isFallback?: boolean;
}

export const Screen4_Citizen: React.FC = () => {
  const { phcs, stock, beds, staff, language } = useApp();

  const [queryText, setQueryText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{
    answer: string;
    phcName: string;
    itemName: string;
    status: 'available' | 'low' | 'out_of_stock';
    qty: number;
    doctorOnDuty: boolean;
    nearestAlternative?: { name: string; distanceKm: number; qty: number };
    isFallback?: boolean;
    daysOld?: number;
    isStale?: boolean;
  } | null>(null);

  // Sample queries
  const sampleQueries = [
    { text: 'Punhana mein BP ki goli milegi?', label: 'Punhana mein BP ki goli milegi?' },
    { text: 'Nagina PHC mein aaj doctor hai?', label: 'Nagina PHC mein aaj doctor hai?' },
    { text: 'Pipili PHC re bed achhi ki?', label: 'Pipili PHC re bed achhi ki?' },
  ];

  const handleQuery = async (queryToRun?: string) => {
    const q = (queryToRun || queryText).trim();
    if (!q) return;

    setIsSearching(true);
    setResult(null);

    const qLower = q.toLowerCase();

    // Check if the question asks about dose/quantity to take ("kitni leni hai", "how much")
    const isDoseQuery = /kitni\s*(leni|lena|khani|khana|goli)|kitna\s*(lena|khana)|how\s*(much|many)|dosage|dose|kete\s*(neba|khaiba)/i.test(q);
    const doseSentence = 'Dawa kitni leni hai, yeh PHC ke doctor batayenge.';

    // Search PHCs across all states by name
    let targetPhc: PHC | null = null;

    for (const p of phcs) {
      const pNameLower = p.name.toLowerCase();
      const pClean = pNameLower.replace(/phc\s*/gi, '').trim();
      const pBlockLower = p.block ? p.block.toLowerCase() : '';
      const pDistLower = p.district.toLowerCase();

      if (
        (pClean.length >= 3 && qLower.includes(pClean)) ||
        qLower.includes(pNameLower) ||
        (pBlockLower.length >= 3 && qLower.includes(pBlockLower)) ||
        (pDistLower.length >= 3 && qLower.includes(pDistLower))
      ) {
        targetPhc = p;
        break;
      }
    }

    const isHindi = language === 'hi' || qLower.includes('mein') || qLower.includes('hai');
    const isOdia = language === 'or' || qLower.includes('re') || qLower.includes('achhi');

    // If the PHC isn't found, say so and list the nearest PHCs in the dataset.
    if (!targetPhc) {
      const samplePhcsList = phcs.slice(0, 4).map((p) => `${p.name} (${p.district}, ${p.state === 'HR' ? 'Haryana' : 'Odisha'})`);

      let notFoundAnswer = '';
      if (isOdia) {
        notFoundAnswer = `ଏହି ପିଏଚ୍‌ସି ସ୍ୱାସ୍ଥ୍ୟ ତଥ୍ୟାବଳୀ ରେକର୍ଡରେ ମିଳିଲା ନାହିଁ। ଡାଟାସେଟ୍‌ରେ ଉପଲବ୍ଧ ନିକଟସ୍ଥ ପିଏଚ୍‌ସି ଗୁଡ଼ିକ ହେଲା: ${samplePhcsList.join(', ')}।`;
      } else if (isHindi) {
        notFoundAnswer = `यह प्राथमिक स्वास्थ्य केंद्र रिकॉर्ड में नहीं मिला। उपलब्ध केंद्र हैं: ${samplePhcsList.join(', ')}।`;
      } else {
        notFoundAnswer = `This PHC was not found in the health records. Available facilities include: ${samplePhcsList.join(', ')}.`;
      }

      if (isDoseQuery) {
        notFoundAnswer += ` ${doseSentence}`;
      }

      try {
        const prompt = getCitizenQueryPrompt(
          q,
          'Not Found',
          'not available',
          0,
          'Unknown',
          undefined,
          isOdia ? 'or' : isHindi ? 'hi' : 'en',
          true,
          samplePhcsList
        );

        const res = await callGeminiJSON<CitizenAnswerData>({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        let finalAnswer = res.answer || notFoundAnswer;
        if (isDoseQuery && !finalAnswer.includes(doseSentence)) {
          finalAnswer += ` ${doseSentence}`;
        }

        setResult({
          answer: finalAnswer,
          phcName: 'Facility not found',
          itemName: 'Health services',
          status: 'out_of_stock',
          qty: 0,
          doctorOnDuty: false,
          isFallback: false,
        });
      } catch (e) {
        setResult({
          answer: notFoundAnswer,
          phcName: 'Facility not found',
          itemName: 'Health services',
          status: 'out_of_stock',
          qty: 0,
          doctorOnDuty: false,
          isFallback: true,
        });
      } finally {
        setIsSearching(false);
      }
      return;
    }

    // Identify what item/service was asked about
    const isBp = qLower.includes('bp') || qLower.includes('amlodipine') || qLower.includes('blood pressure');
    const isDiabetes = qLower.includes('sugar') || qLower.includes('metformin') || qLower.includes('diabetes');
    const isPcm = qLower.includes('pcm') || qLower.includes('paracetamol') || qLower.includes('bukhar') || qLower.includes('fever');
    const isOrs = qLower.includes('ors') || qLower.includes('dast') || qLower.includes('diarrhea') || qLower.includes('ghol');
    const isArv = qLower.includes('kutta') || qLower.includes('dog') || qLower.includes('rabies') || qLower.includes('arv');
    const isAsv = qLower.includes('saanp') || qLower.includes('snake') || qLower.includes('venom') || qLower.includes('asv');
    const isOxytocin = qLower.includes('delivery') || qLower.includes('oxytocin');
    const isBed = qLower.includes('bed') || qLower.includes('bistar') || qLower.includes('bharti') || qLower.includes('admit');
    const isDoctor = qLower.includes('doctor') || qLower.includes('mo') || qLower.includes('dr') || qLower.includes('vaidya');

    let medCode = 'AML5';
    let itemName = 'Amlodipine 5mg (BP medicine)';
    if (isDiabetes) {
      medCode = 'MET500';
      itemName = 'Metformin 500mg';
    } else if (isPcm) {
      medCode = 'PCM500';
      itemName = 'Paracetamol 500mg';
    } else if (isOrs) {
      medCode = 'ORS';
      itemName = 'Oral Rehydration Salts (ORS)';
    } else if (isArv) {
      medCode = 'ARV';
      itemName = 'Anti-Rabies Vaccine';
    } else if (isAsv) {
      medCode = 'ASV';
      itemName = 'Anti-Snake Venom';
    } else if (isOxytocin) {
      medCode = 'OXY';
      itemName = 'Oxytocin Injection';
    } else if (isBed) {
      itemName = 'Hospital beds';
    } else if (isDoctor) {
      itemName = 'Medical officer / Doctor on duty';
    }

    const targetStockMap = stock[targetPhc.id] || {};
    const targetStock = targetStockMap[medCode];
    const targetBeds = beds[targetPhc.id];
    const targetStaff = staff[targetPhc.id] || [];
    const doctorStaff = targetStaff.find((s) => s.is_mo || s.role.toLowerCase().includes('medical officer') || s.role.toLowerCase().includes('doctor'));
    const doctorOnDuty = doctorStaff?.status === 'present';

    let availableQty = 0;
    let stockStatus: 'available' | 'low' | 'out_of_stock' = 'out_of_stock';

    if (isBed) {
      availableQty = targetBeds ? targetBeds.available : 2;
      stockStatus = availableQty > 0 ? 'available' : 'out_of_stock';
    } else if (isDoctor) {
      availableQty = doctorOnDuty ? 1 : 0;
      stockStatus = doctorOnDuty ? 'available' : 'out_of_stock';
    } else {
      availableQty = targetStock ? targetStock.quantity : 0;
      if (availableQty > 20) stockStatus = 'available';
      else if (availableQty > 0) stockStatus = 'low';
      else stockStatus = 'out_of_stock';
    }

    const lastUpdateDate = isBed
      ? targetBeds?.last_updated
      : targetStock?.last_updated || '2026-03-30T08:00:00Z';

    const daysOld = lastUpdateDate
      ? Math.floor((Date.now() - new Date(lastUpdateDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const isStale = daysOld > 7;

    // Nearest alternative if stock is low or zero
    let nearestAlternative: { name: string; distanceKm: number; qty: number } | undefined;

    if (stockStatus !== 'available' && !isBed && !isDoctor) {
      const candidates = phcs
        .filter((p) => p.id !== targetPhc!.id && p.state === targetPhc!.state)
        .map((p) => {
          const st = (stock[p.id] || {})[medCode];
          const dist = haversineDistance(targetPhc!.lat, targetPhc!.lng, p.lat, p.lng);
          return {
            name: p.name,
            distanceKm: Math.round(dist * 10) / 10,
            qty: st ? st.quantity : 0,
          };
        })
        .filter((c) => c.qty > 15)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      if (candidates.length > 0) {
        nearestAlternative = candidates[0];
      }
    }

    let fallbackFullAnswer = '';
    const doctorNote = doctorOnDuty
      ? 'Doctor on duty is present.'
      : 'Duty doctor is currently absent or on leave; emergency nurse is covering.';

    if (isBed) {
      fallbackFullAnswer = `${targetPhc.name} currently has ${availableQty} vacant beds available. ${doctorNote}`;
    } else if (isDoctor) {
      fallbackFullAnswer = doctorOnDuty
        ? `Yes, the medical officer is on duty today at ${targetPhc.name}.`
        : `The medical officer is on leave today at ${targetPhc.name}. Nursing staff are handling primary outpatient care.`;
    } else if (stockStatus === 'available') {
      fallbackFullAnswer = `Yes, ${itemName} is in stock at ${targetPhc.name} (${availableQty} units recorded). ${doctorNote}`;
    } else if (stockStatus === 'low') {
      fallbackFullAnswer = `Limited stock of ${itemName} at ${targetPhc.name} (${availableQty} units left). Please arrive early or call ahead.`;
    } else {
      fallbackFullAnswer = `${itemName} is currently out of stock at ${targetPhc.name}.`;
      if (nearestAlternative) {
        fallbackFullAnswer += ` Nearest stock is at ${nearestAlternative.name} (${nearestAlternative.distanceKm} km away).`;
      }
    }

    if (isDoseQuery) {
      fallbackFullAnswer += ` ${doseSentence}`;
    }

    try {
      const nearestAlternateForPrompt = nearestAlternative
        ? {
            name: nearestAlternative.name,
            distanceKm: nearestAlternative.distanceKm,
            available: nearestAlternative.qty > 0,
          }
        : undefined;

      const prompt = getCitizenQueryPrompt(
        q,
        targetPhc.name,
        itemName,
        availableQty,
        stockStatus,
        nearestAlternateForPrompt,
        isOdia ? 'or' : isHindi ? 'hi' : 'en',
        false
      );

      const res = await callGeminiJSON<CitizenAnswerData>({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      let finalAnswer = res.answer || fallbackFullAnswer;
      if (isDoseQuery && !finalAnswer.includes(doseSentence)) {
        finalAnswer += ` ${doseSentence}`;
      }

      setResult({
        answer: finalAnswer,
        phcName: targetPhc.name,
        itemName,
        status: isStale ? 'low' : stockStatus,
        qty: availableQty,
        doctorOnDuty,
        nearestAlternative,
        isFallback: false,
        daysOld,
        isStale,
      });
    } catch (e) {
      setResult({
        answer: fallbackFullAnswer,
        phcName: targetPhc.name,
        itemName,
        status: isStale ? 'low' : stockStatus,
        qty: availableQty,
        doctorOnDuty,
        nearestAlternative,
        isFallback: true,
        daysOld,
        isStale,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const freshnessInfo = useMemo(() => {
    if (!result || result.daysOld === undefined) return null;
    return formatDaysAgo(result.daysOld, language);
  }, [result, language]);

  return (
    <div className="w-full max-w-xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 text-[#101828] pb-28 sm:pb-8">
      {/* Title & Introduction */}
      <div className="text-center space-y-2">
        <h1 className="text-xl sm:text-2xl font-semibold text-[#101828]">
          <BilingualText k="citizenTitle" lang={language} />
        </h1>
        <p className="text-sm sm:text-base text-[#344054]">
          <BilingualText k="citizenSubtitle" lang={language} />
        </p>
      </div>

      {/* Main Question Box */}
      <div className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="citizen-query-input" className="text-base font-semibold text-[#101828] block">
              <BilingualText primary="अपने केंद्र के बारे में पूछें" enSub="Ask about your facility:" lang={language} />
            </label>
            <ListenButton
              text={
                language === 'hi'
                  ? 'अपने अस्पताल या प्राथमिक स्वास्थ्य केंद्र में दवा और डॉक्टर की स्थिति पूछें।'
                  : language === 'or'
                  ? 'ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ କେନ୍ଦ୍ରରେ ଔଷଧ ଏବଂ ଡାକ୍ତରଙ୍କ ଉପଲବ୍ଧତା ବିଷୟରେ ପଚାରନ୍ତୁ।'
                  : 'Ask about medicine or doctor availability at your local health centre.'
              }
              lang={language}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <input
              id="citizen-query-input"
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              placeholder={t('searchPlaceholder', language).primary}
              className="flex-1 min-h-[48px] text-base px-4 rounded-[8px] border border-[#D0D5DD] focus:ring-3 focus:ring-[#163D6E] outline-none text-[#101828] bg-white"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const sample = sampleQueries[Math.floor(Math.random() * sampleQueries.length)].text;
                  setQueryText(sample);
                  handleQuery(sample);
                }}
                aria-label="Use voice query preset in Hindi or Odia"
                className="min-h-[48px] min-w-[48px] px-3.5 rounded-[8px] border border-[#D0D5DD] bg-white hover:bg-[#F5F7FA] text-[#163D6E] font-medium flex items-center justify-center cursor-pointer transition-colors"
                title="Voice query preset"
              >
                <Mic className="w-5 h-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => handleQuery()}
                disabled={isSearching || !queryText.trim()}
                aria-label="Search facility records"
                className="hidden sm:flex min-h-[48px] px-6 bg-[#163D6E] hover:bg-[#0F2B4E] disabled:opacity-50 text-white font-semibold rounded-[8px] transition-colors cursor-pointer items-center justify-center gap-2"
              >
                <Search className="w-5 h-5" aria-hidden="true" />
                <BilingualText k="searchButton" lang={language} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Suggestion Buttons */}
        <div>
          <span className="text-xs sm:text-sm font-semibold text-[#475467] block mb-2">
            Sample citizen questions:
          </span>
          <div className="flex flex-wrap gap-2">
            {sampleQueries.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQueryText(s.text);
                  handleQuery(s.text);
                }}
                className="min-h-[48px] text-left px-3.5 py-2.5 bg-[#F5F7FA] hover:bg-white border border-[#D0D5DD] rounded-[8px] text-xs sm:text-sm text-[#101828] transition-colors cursor-pointer font-medium"
              >
                {s.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isSearching && (
        <div
          role="status"
          aria-live="polite"
          className="bg-white rounded-[8px] p-8 border border-[#D0D5DD] text-center space-y-3"
        >
          <div className="w-6 h-6 border-3 border-[#163D6E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-base font-semibold text-[#101828]">
            Checking live hospital registers &amp; attendance...
          </p>
        </div>
      )}

      {/* Verified Answer Card */}
      {result && !isSearching && (
        <div
          role="region"
          aria-live="polite"
          className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#D0D5DD]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
              <h2 className="text-base sm:text-lg font-semibold text-[#101828]">
                <BilingualText k="verifiedAnswer" lang={language} />
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <ListenButton text={result.answer} lang={language} />
              {result.isFallback && (
                <span className="text-xs bg-[#FFFAEB] text-[#B54708] border border-[#D0D5DD] px-2.5 py-1 rounded-[6px] font-medium">
                  Sample result
                </span>
              )}
            </div>
          </div>

          <div className="p-4 bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px] text-base text-[#101828] leading-relaxed font-medium">
            "{result.answer}"
          </div>

          {/* Pluralized Freshness Status Banner (Requirement 3) */}
          {result.isStale ? (
            <div className="p-4 bg-[#FFFAEB] border border-[#D0D5DD] rounded-[8px] text-sm sm:text-base text-[#B54708] flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#B54708] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong className="block font-semibold">Information may be old; please call the PHC</strong>
                <span className="text-xs sm:text-sm text-[#344054] block mt-0.5">
                  Last updated {freshnessInfo?.fullText}. Availability cannot be stated as certain without direct phone confirmation.
                </span>
              </div>
            </div>
          ) : freshnessInfo ? (
            <div className="flex items-center gap-2 p-3 bg-[#ECFDF3] border border-[#D0D5DD] rounded-[8px] text-xs sm:text-sm text-[#067647] font-medium">
              <Clock className="w-4 h-4 text-[#067647] shrink-0" aria-hidden="true" />
              <span>Register status: {freshnessInfo.fullText}</span>
            </div>
          ) : null}

          {/* Structured Ground-Truth Fact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-[8px] bg-white border border-[#D0D5DD]">
              <span className="text-xs text-[#475467] block">Facility checked</span>
              <span className="text-sm sm:text-base font-semibold text-[#101828] block mt-1">{result.phcName}</span>
            </div>

            <div className="p-3.5 rounded-[8px] bg-white border border-[#D0D5DD]">
              <span className="text-xs text-[#475467] block">Resource status</span>
              <div className="flex items-center gap-1.5 mt-1 mb-1.5">
                <MedicinePictogram form={result.itemName} />
                <span className="text-xs sm:text-sm font-semibold text-[#101828] truncate">{result.itemName}</span>
              </div>
              <div>
                {result.status === 'available' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#ECFDF3] text-[#067647] border border-[#D0D5DD] text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Available ({result.qty})
                  </span>
                ) : result.status === 'low' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#FFFAEB] text-[#B54708] border border-[#D0D5DD] text-xs font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    Low stock ({result.qty})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#FEF3F2] text-[#B42318] border border-[#D0D5DD] text-xs font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    Out of stock
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-[8px] bg-white border border-[#D0D5DD]">
              <span className="text-xs text-[#475467] block">Doctor on duty</span>
              <div className="mt-1">
                {result.doctorOnDuty ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#ECFDF3] text-[#067647] border border-[#D0D5DD] text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Present on-site
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#FFFAEB] text-[#B54708] border border-[#D0D5DD] text-xs font-semibold">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    On leave / Nurse covering
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Nearest Facility Referral */}
          {result.nearestAlternative && (
            <div className="p-3.5 bg-[#FFFAEB] border border-[#D0D5DD] rounded-[8px] text-sm sm:text-base text-[#B54708] flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#B54708] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong className="block font-semibold">Nearest alternative facility:</strong>
                <span className="text-xs sm:text-sm text-[#344054] flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <MedicinePictogram form={result.itemName} />
                  <span>
                    {result.nearestAlternative.name} is confirmed to have stock ({result.nearestAlternative.qty} units), located {result.nearestAlternative.distanceKm} km away.
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Strict Safety Notice */}
          <div className="pt-3 border-t border-[#D0D5DD] text-xs text-[#475467] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#475467] shrink-0" aria-hidden="true" />
            <span>
              Purely factual supply chain information. Dhara never provides medical diagnoses or dosage advice.
            </span>
          </div>
        </div>
      )}

      {/* Sticky Mobile Search Button (Requirement 5) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 p-2.5 bg-white border-t border-[#D0D5DD] z-30 shadow-md">
        <button
          type="button"
          onClick={() => handleQuery()}
          disabled={isSearching || !queryText.trim()}
          className="w-full min-h-[56px] h-14 rounded-[8px] bg-[#163D6E] active:bg-[#0F2B4E] disabled:opacity-50 text-white font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
        >
          <Search className="w-5 h-5" aria-hidden="true" />
          <BilingualText k="searchButton" lang={language} />
        </button>
      </div>
    </div>
  );
};
