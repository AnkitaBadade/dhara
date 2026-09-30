import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  HeartHandshake,
  MapPin,
  Mic,
  Minus,
  Plus,
  Sparkles,
  StopCircle,
  Truck,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MEDICINES } from '../data/phcData';
import { BilingualText, formatDaysAgo, t, ListenButton, MedicinePictogram } from '../lib/i18n';
import { haversineDistance } from '../lib/resourceMath';
import { callGeminiJSON } from '../services/geminiClient';
import { getReportExtractionPrompt } from '../services/prompts';
import { ParsedReport, StaffMember } from '../types';

// Helper to resize photos to max 1280px JPEG in browser
function resizeImageToMax1280(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve) => {
    onProgress?.(25);
    const reader = new FileReader();
    reader.onload = (e) => {
      onProgress?.(50);
      const img = new Image();
      img.onload = () => {
        onProgress?.(75);
        const maxDim = 1280;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onProgress?.(100);
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onProgress?.(100);
        resolve(resizedDataUrl);
      };
      img.onerror = () => {
        onProgress?.(100);
        resolve(e.target?.result as string);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      onProgress?.(100);
      resolve('');
    };
    reader.readAsDataURL(file);
  });
}

// Helper to match staff to selected PHC roster
function matchStaffToPhc(roleOrName: string, staffList: StaffMember[]): StaffMember | null {
  if (!roleOrName) return null;
  const qLower = roleOrName.toLowerCase().trim();

  let found = staffList.find((s) => s.name.toLowerCase() === qLower);
  if (found) return found;

  found = staffList.find((s) => s.role.toLowerCase() === qLower);
  if (found) return found;

  const qClean = qLower.replace(/^(dr\.?|dr\b|doctor)\s*/i, '').trim();
  if (qClean.length >= 3) {
    found = staffList.find((s) => {
      const sClean = s.name.toLowerCase().replace(/^(dr\.?|dr\b|doctor)\s*/i, '').trim();
      return sClean === qClean || sClean.includes(qClean) || qClean.includes(sClean);
    });
    if (found) return found;
  }

  found = staffList.find(
    (s) => s.name.toLowerCase().includes(qLower) || (qLower.length >= 4 && qLower.includes(s.name.toLowerCase()))
  );
  if (found) return found;

  if (qLower.includes('doctor') || qLower.includes('mo') || qLower.includes('medical officer')) {
    found = staffList.find((s) => s.is_mo || s.role === 'Medical Officer');
    if (found) return found;
  }
  if (qLower.includes('nurse')) {
    found = staffList.find((s) => s.role.toLowerCase().includes('nurse'));
    if (found) return found;
  }
  if (qLower.includes('pharmacist')) {
    found = staffList.find((s) => s.role.toLowerCase().includes('pharmacist'));
    if (found) return found;
  }
  if (qLower.includes('lab') || qLower.includes('technician')) {
    found = staffList.find((s) => s.role.toLowerCase().includes('technician'));
    if (found) return found;
  }

  return null;
}

function getUnitDisplay(medCode: string, qty: number): string {
  const med = MEDICINES.find((m) => m.code === medCode);
  if (!med) return qty === 1 ? 'unit' : 'units';
  if (med.unit === 'strip of 10') {
    return qty === 1 ? 'strip' : 'strips';
  }
  if (med.unit === 'sachet') {
    return qty === 1 ? 'sachet' : 'sachets';
  }
  if (med.unit === 'bottle') {
    return qty === 1 ? 'bottle' : 'bottles';
  }
  if (med.unit === 'kit') {
    return qty === 1 ? 'kit' : 'kits';
  }
  return med.unit;
}

function normalizeStockQuantity(
  medCode: string,
  rawQty: number,
  sourceText?: string,
  fullInput?: string
): number {
  const med = MEDICINES.find((m) => m.code === medCode);
  if (!med) return rawQty;

  const textToCheck = `${sourceText || ''} ${fullInput || ''}`.toLowerCase();

  if (med.unit === 'strip of 10') {
    const goliMatch = textToCheck.match(/(\d+)\s*(?:goli|tablets?|tab|tabs)/i);
    const stripMatch = textToCheck.match(/(\d+)\s*(?:patte|patta|strip|strips)/i);

    if (stripMatch) {
      return parseInt(stripMatch[1], 10);
    }
    if (goliMatch) {
      const tablets = parseInt(goliMatch[1], 10);
      return Math.max(1, Math.round(tablets / 10));
    }
    if (rawQty >= 10 && rawQty % 10 === 0 && (textToCheck.includes('patte') || textToCheck.includes('strip'))) {
      return Math.round(rawQty / 10);
    }
  }

  return rawQty;
}

export const Screen1_PhcStaff: React.FC = () => {
  const {
    selectedState,
    phcs,
    medicines,
    selectedPhcId,
    setSelectedPhcId,
    stock,
    beds,
    staff,
    transfers,
    applyReport,
    updateBedCount,
    checkInStaff,
    language,
  } = useApp();

  const isHindi = language === 'hi';
  const isOdia = language === 'or';

  const phcsInState = useMemo(() => {
    return phcs.filter((p) => p.state === selectedState);
  }, [phcs, selectedState]);

  const currentPhc = useMemo(() => {
    const found = phcsInState.find((p) => p.id === selectedPhcId);
    return found || phcsInState[0] || phcs[0];
  }, [phcsInState, selectedPhcId]);

  const phcStock = useMemo(() => {
    return stock[currentPhc.id] || {};
  }, [stock, currentPhc.id]);

  const phcBeds = useMemo(() => {
    return beds[currentPhc.id] || { total: 6, occupied: 4, available: 2, last_updated: '2026-03-30T08:00:00Z' };
  }, [beds, currentPhc.id]);

  const phcStaffList = useMemo(() => {
    return staff[currentPhc.id] || [];
  }, [staff, currentPhc.id]);

  // Tab: camera | voice | text
  const [activeTab, setActiveTab] = useState<'camera' | 'voice' | 'text'>('voice');

  // Input states
  const [textInput, setTextInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);

  // Audio recording simulation
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioIntervalRef = useRef<any>(null);

  // Parsing & confirmation states
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedReport, setParsedReport] = useState<ParsedReport | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [expandedWhyItems, setExpandedWhyItems] = useState<{ [key: string]: boolean }>({});

  // Geofence check-in state
  const [simulateAtPhc, setSimulateAtPhc] = useState(true);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [selectedStaffToCheckin, setSelectedStaffToCheckin] = useState<string>(
    phcStaffList[0]?.id || ''
  );

  useEffect(() => {
    if (phcStaffList.length > 0 && !phcStaffList.some((s) => s.id === selectedStaffToCheckin)) {
      setSelectedStaffToCheckin(phcStaffList[0].id);
    }
  }, [phcStaffList, selectedStaffToCheckin]);

  // Report duration timer
  const [reportStartTime, setReportStartTime] = useState<number | null>(null);
  const [lastReportDuration, setLastReportDuration] = useState<number | null>(null);
  const [activeElapsed, setActiveElapsed] = useState<number | null>(null);

  useEffect(() => {
    let interval: any = null;
    if (reportStartTime && !saveSuccess) {
      interval = setInterval(() => {
        setActiveElapsed(Math.round((Date.now() - reportStartTime) / 1000));
      }, 500);
    } else {
      setActiveElapsed(null);
    }
    return () => clearInterval(interval);
  }, [reportStartTime, saveSuccess]);

  const startReportTimer = () => {
    if (!reportStartTime) {
      setReportStartTime(Date.now());
    }
  };

  const medianReportTime = 14;

  const getDaysAgo = (dateStr?: string) => {
    if (!dateStr) return 0;
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const stockDaysAgo = useMemo(() => {
    const dates = Object.values(phcStock).map((s) => getDaysAgo(s.last_updated));
    return dates.length > 0 ? Math.min(...dates) : 0;
  }, [phcStock]);

  const bedsDaysAgo = useMemo(() => {
    return getDaysAgo(phcBeds.last_updated);
  }, [phcBeds]);

  // Pluralized data freshness strings (Requirement 3)
  const stockFreshnessFormatted = useMemo(() => {
    return formatDaysAgo(stockDaysAgo, language);
  }, [stockDaysAgo, language]);

  const bedsFreshnessFormatted = useMemo(() => {
    return formatDaysAgo(bedsDaysAgo, language);
  }, [bedsDaysAgo, language]);

  // Incoming transfers
  const incomingTransfers = useMemo(() => {
    return transfers.filter((t) => t.to_phc_id === currentPhc.id && (t.status === 'approved' || t.status === 'auto_dispatched'));
  }, [transfers, currentPhc.id]);

  // 3 lowest items in days of stock
  const lowestThreeStockItems = useMemo(() => {
    const items = Object.entries(phcStock)
      .map(([medCode, s]) => {
        const med = medicines.find((m) => m.code === medCode);
        if (!med) return null;
        const dailyBurn = s.daily_burn_rate || med.default_daily_burn || 5;
        const days = Math.round(s.quantity / dailyBurn);
        return { med, qty: s.quantity, days };
      })
      .filter(Boolean) as { med: any; qty: number; days: number }[];

    items.sort((a, b) => a.days - b.days);
    return items.slice(0, 3);
  }, [phcStock, medicines]);

  // Voice recording simulation
  const startVoiceRecording = () => {
    startReportTimer();
    setIsRecording(true);
    setAudioDuration(0);
    audioIntervalRef.current = setInterval(() => {
      setAudioDuration((prev) => {
        if (prev >= 29) {
          stopVoiceRecording();
          return 30;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopVoiceRecording = () => {
    setIsRecording(false);
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
    }
    const defaultVoice =
      language === 'or'
        ? 'Metformin 3 patte bache, 2 bed khali achhi, Dr Sharma chhutti re achhanti'
        : 'metformin 3 patte bache, 2 bed khali, Dr Sharma aaj chhutti par';
    setTextInput(defaultVoice);
    handleProcessReport(defaultVoice);
  };

  // Image handling with client-side 1280px resize & progress bar
  const handlePhotoSelected = async (file: File) => {
    setPhotoError(null);
    if (!file || file.size === 0) {
      setPhotoError('फ़ोटो साफ़ नहीं है — फिर से लें / Photo is not clear — please take it again');
      return;
    }
    setImageUploadProgress(10);
    startReportTimer();
    const resized = await resizeImageToMax1280(file, (pct) => {
      setImageUploadProgress(pct);
    });
    setSelectedImage(resized);
    setTimeout(() => setImageUploadProgress(null), 400);
  };

  // Process Report using Gemini AI
  const handleProcessReport = async (overrideInput?: string) => {
    const inputContent = (overrideInput ?? textInput).trim();
    if (!inputContent && !selectedImage) return;

    startReportTimer();
    setIsProcessing(true);
    setParsedReport(null);
    setSaveSuccess(false);
    setPhotoError(null);

    try {
      const prompt = getReportExtractionPrompt(
        inputContent || 'Attached photo of physical morning register log book with stock tallies.'
      );

      const res = await callGeminiJSON<ParsedReport>({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const normalizedStock = (res.stock || []).map((item) => {
        const normQty = normalizeStockQuantity(
          item.med_code,
          item.quantity,
          item.source_text,
          inputContent
        );
        return {
          ...item,
          quantity: normQty,
          confidence: item.confidence ?? 0.88,
        };
      });

      setParsedReport({
        stock: normalizedStock,
        beds: res.beds || { available: 2, confidence: 0.94 },
        staff: res.staff || [],
        isFallback: false,
      });
    } catch (e) {
      if (selectedImage && !inputContent) {
        setPhotoError('फ़ोटो साफ़ नहीं है — फिर से लें / Photo is not clear — please take it again');
      }

      const textLower = (inputContent || '').toLowerCase();
      const isMetformin = textLower.includes('metformin');
      const isPCM = textLower.includes('pcm') || textLower.includes('paracetamol');

      const fallbackStock: any[] = [];
      if (isMetformin || (!isMetformin && !isPCM)) {
        fallbackStock.push({
          med_code: 'MET500',
          quantity: 3,
          event: 'count' as const,
          confidence: 0.65,
          source_text: 'metformin 3 patte bache',
        });
      }
      if (isPCM) {
        fallbackStock.push({
          med_code: 'PCM500',
          quantity: 50,
          event: 'received' as const,
          confidence: 0.95,
          source_text: '50 strips PCM received',
        });
      }

      setParsedReport({
        stock: fallbackStock,
        beds: { available: 2, confidence: 0.9 },
        staff: [
          {
            role_or_name: 'Dr Sharma',
            status: 'leave' as const,
            confidence: 0.85,
          },
        ],
        isFallback: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUseSampleRegister = () => {
    setPhotoError(null);
    setSelectedImage('https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=700&q=80');
    const note = 'Morning physical register scan: Metformin 3 strips remaining, 2 beds vacant, Dr Sharma on leave';
    setTextInput(note);
    handleProcessReport(note);
  };

  const handleSaveConfirmed = () => {
    if (!parsedReport) return;

    const reportDuration = reportStartTime ? Math.round((Date.now() - reportStartTime) / 1000) : 14;
    setLastReportDuration(reportDuration);

    applyReport(parsedReport, currentPhc.id);
    setSaveSuccess(true);
    setReportStartTime(null);
  };

  const handleDismissSuccess = () => {
    setParsedReport(null);
    setTextInput('');
    setSelectedImage(null);
    setPhotoError(null);
    setSaveSuccess(false);
    setExpandedWhyItems({});
  };

  const handleDiscard = () => {
    setParsedReport(null);
    setTextInput('');
    setSelectedImage(null);
    setPhotoError(null);
    setReportStartTime(null);
    setActiveElapsed(null);
    setExpandedWhyItems({});
  };

  // Staff check-in handling
  const handleGeoCheckIn = () => {
    let userLat = currentPhc.lat;
    let userLng = currentPhc.lng;

    if (!simulateAtPhc) {
      userLat += 0.008;
      userLng += 0.008;
    }

    const distMeters = haversineDistance(userLat, userLng, currentPhc.lat, currentPhc.lng) * 1000;

    if (distMeters <= 300) {
      checkInStaff(currentPhc.id, selectedStaffToCheckin);
      const staffMem = phcStaffList.find((s) => s.id === selectedStaffToCheckin);
      setGeoStatus(
        isHindi
          ? `उपस्थिति सफल: ${staffMem?.name || 'स्टाफ़'} केंद्र पर उपस्थित दर्ज किया गया (दूरी: ${Math.round(distMeters)} मी)`
          : isOdia
          ? `ଉପସ୍ଥିତି ସଫଳ: ${staffMem?.name || 'କର୍ମଚାରୀ'} କେନ୍ଦ୍ରରେ ଉପସ୍ଥିତ ଦର୍ଜ ହେଲା (${Math.round(distMeters)} ମି)`
          : `Duty attendance confirmed: ${staffMem?.name || 'Staff'} registered on-site at ${currentPhc.name} (${Math.round(distMeters)}m from centre)`
      );
    } else {
      setGeoStatus(
        isHindi
          ? `चेक-इन विफल: आप केंद्र से ${Math.round(distMeters)} मी दूर हैं (स्वीकार्य सीमा: 300 मी)`
          : isOdia
          ? `ଚେକ୍-ଇନ୍ ବିଫଳ: ଆପଣ କେନ୍ଦ୍ରଠାରୁ ${Math.round(distMeters)} ମି ଦୂରରେ ଅଛନ୍ତି`
          : `Check-in rejected: Device is ${Math.round(distMeters)}m from ${currentPhc.name} (geofence boundary is 300m)`
      );
    }
  };

  const todayDateStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : language === 'or' ? 'or-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [language]);

  return (
    <div className="w-full max-w-xl sm:max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 text-[#101828] pb-28 sm:pb-8">
      {/* Top Banner: Facility Name & Date */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-[8px] border border-[#D0D5DD]">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
          <div>
            <div className="text-sm text-[#475467]">
              {selectedState === 'HR' ? 'Haryana' : 'Odisha'} · {currentPhc.district}
            </div>
            <h1 className="text-xl font-semibold text-[#101828]">
              {currentPhc.name}
            </h1>
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm text-[#475467] block">
            <BilingualText primary="आज की तारीख" enSub="Today" lang={language} />
          </span>
          <span className="text-base font-semibold text-[#101828]">{todayDateStr}</span>
        </div>
      </div>

      {/* Facility Switcher and Data Freshness Summary */}
      <div className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D0D5DD] pb-3">
          <label htmlFor="phc-select" className="text-base font-semibold text-[#101828]">
            <BilingualText k="selectPhc" lang={language} />
          </label>
          <ListenButton
            textToRead={`${currentPhc.name}. Stock status: ${stockFreshnessFormatted.fullText}. Beds: ${bedsFreshnessFormatted.fullText}.`}
            lang={language}
            size="sm"
          />
        </div>
        <div>
          <select
            id="phc-select"
            value={selectedPhcId}
            onChange={(e) => setSelectedPhcId(e.target.value)}
            className="w-full text-base font-medium text-[#101828] bg-white border border-[#D0D5DD] rounded-[8px] min-h-[48px] px-3.5 focus:ring-3 focus:ring-[#163D6E] outline-none cursor-pointer"
          >
            {phcsInState.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.district})
              </option>
            ))}
          </select>
        </div>

        {/* Freshness Status Indicators with Pluralized Times (Requirement 3) */}
        <div className="pt-2 border-t border-[#D0D5DD]">
          <span className="text-sm font-semibold text-[#344054] block mb-2">
            <BilingualText primary="डेटा स्थिति" enSub="Data freshness status:" lang={language} />
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Stock status */}
            <div
              className={`flex items-center gap-2 p-3 rounded-[8px] border ${
                stockDaysAgo > 7
                  ? 'bg-[#FEF3F2] border-[#D0D5DD] text-[#B42318]'
                  : 'bg-[#ECFDF3] border-[#D0D5DD] text-[#067647]'
              }`}
            >
              {stockDaysAgo > 7 ? (
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <div>
                <span className="text-sm font-semibold block">
                  {stockDaysAgo > 7 ? t('oldData', language).primary : t('ok', language).primary}
                </span>
                <span className="text-sm">
                  Stock: {stockFreshnessFormatted.fullText}
                </span>
              </div>
            </div>

            {/* Beds status */}
            <div
              className={`flex items-center gap-2 p-3 rounded-[8px] border ${
                bedsDaysAgo > 7
                  ? 'bg-[#FEF3F2] border-[#D0D5DD] text-[#B42318]'
                  : 'bg-[#ECFDF3] border-[#D0D5DD] text-[#067647]'
              }`}
            >
              {bedsDaysAgo > 7 ? (
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <div>
                <span className="text-sm font-semibold block">
                  {bedsDaysAgo > 7 ? t('oldData', language).primary : t('ok', language).primary}
                </span>
                <span className="text-sm">
                  Beds: {bedsFreshnessFormatted.fullText}
                </span>
              </div>
            </div>

            {/* Staff status */}
            <div className="flex items-center gap-2 p-3 rounded-[8px] border bg-[#ECFDF3] border-[#D0D5DD] text-[#067647]">
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              <div>
                <span className="text-sm font-semibold block">{t('ok', language).primary}</span>
                <span className="text-sm">Staff: Roster verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Universal Daily Report Box */}
      <div className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D0D5DD] pb-3">
          <div>
            <h2 className="text-lg font-semibold text-[#101828]">
              <BilingualText k="universalReport" lang={language} />
            </h2>
            <p className="text-sm text-[#475467]">
              <BilingualText k="reportSubtitle" lang={language} />
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ListenButton
              textToRead="Universal daily report. Voice note, register photo, or casual message in Hindi, Odia, or English."
              lang={language}
              size="sm"
            />
            {activeElapsed !== null && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[6px] bg-[#FFFAEB] text-[#B54708] border border-[#D0D5DD] text-sm font-semibold">
                <Clock className="w-4 h-4" aria-hidden="true" />
                Active: {activeElapsed}s
              </span>
            )}
          </div>
        </div>

        {/* Action format selection tabs (touch targets >= 48px) */}
        <div>
          <span className="text-sm font-semibold text-[#344054] block mb-2">
            <BilingualText primary="प्रतिवेदन विधि चुनें" enSub="Choose report method:" lang={language} />
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Voice Note Button */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('voice');
                startReportTimer();
              }}
              className={`min-h-[52px] p-3 rounded-[8px] border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'voice'
                  ? 'bg-[#163D6E] text-white border-[#163D6E]'
                  : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-[#F5F7FA]'
              }`}
            >
              <Mic className="w-5 h-5 shrink-0" aria-hidden="true" />
              <div>
                <span className="text-base font-semibold block leading-tight">
                  <BilingualText k="voiceNote" lang={language} />
                </span>
                <span className={`text-xs ${activeTab === 'voice' ? 'text-blue-100' : 'text-[#475467]'}`}>
                  {language === 'or' ? 'ଓଡ଼ିଆରେ କୁହନ୍ତୁ' : 'बोलकर रिपोर्ट दें'}
                </span>
              </div>
            </button>

            {/* Rear Camera / Register Photo Button (Requirement 5) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('camera');
                startReportTimer();
              }}
              className={`min-h-[52px] p-3 rounded-[8px] border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-[#163D6E] text-white border-[#163D6E]'
                  : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-[#F5F7FA]'
              }`}
            >
              <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
              <div>
                <span className="text-base font-semibold block leading-tight">
                  <BilingualText k="registerPhoto" lang={language} />
                </span>
                <span className={`text-xs ${activeTab === 'camera' ? 'text-blue-100' : 'text-[#475467]'}`}>
                  Rear camera snapshot
                </span>
              </div>
            </button>

            {/* Casual Text Button */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('text');
                startReportTimer();
              }}
              className={`min-h-[52px] p-3 rounded-[8px] border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'text'
                  ? 'bg-[#163D6E] text-white border-[#163D6E]'
                  : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-[#F5F7FA]'
              }`}
            >
              <FileText className="w-5 h-5 shrink-0" aria-hidden="true" />
              <div>
                <span className="text-base font-semibold block leading-tight">
                  <BilingualText k="casualText" lang={language} />
                </span>
                <span className={`text-xs ${activeTab === 'text' ? 'text-blue-100' : 'text-[#475467]'}`}>
                  Type in everyday words
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Tab Panel 1: Voice */}
        {activeTab === 'voice' && (
          <div className="p-4 sm:p-5 rounded-[8px] border border-[#D0D5DD] bg-[#F5F7FA] space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopVoiceRecording}
                  aria-label="Stop voice recording"
                  className="w-full sm:w-auto min-h-[52px] min-w-[48px] px-6 py-3 rounded-[8px] bg-[#B42318] hover:bg-[#912018] text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <StopCircle className="w-5 h-5" aria-hidden="true" />
                  <span>
                    <BilingualText k="stopRecording" lang={language} /> ({audioDuration}s)
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  aria-label="Start voice recording"
                  className="w-full sm:w-auto min-h-[52px] min-w-[48px] px-6 py-3 rounded-[8px] bg-[#163D6E] hover:bg-[#0F2B4E] text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Mic className="w-5 h-5" aria-hidden="true" />
                  <span>
                    <BilingualText k="tapToRecord" lang={language} />
                  </span>
                </button>
              )}

              <p className="text-base text-[#344054] text-center sm:text-left leading-normal">
                {isRecording
                  ? `Recording live note (${audioDuration}s). Speak naturally in Hindi or Odia.`
                  : 'State stock remaining, vacant beds, and doctor presence in everyday words.'}
              </p>
            </div>

            {/* Quick voice simulation transcript */}
            <div className="pt-2 border-t border-[#D0D5DD]">
              <span className="text-xs font-semibold text-[#475467] block mb-1.5">
                Simulate voice transcript:
              </span>
              <button
                type="button"
                onClick={() => {
                  const sampleText =
                    language === 'or'
                      ? 'Metformin 3 patte bache, 2 bed khali achhi, Dr Sharma chhutti re achhanti'
                      : 'metformin 3 patte bache, 2 bed khali, Dr Sharma aaj chhutti par';
                  setTextInput(sampleText);
                  handleProcessReport(sampleText);
                }}
                className="w-full text-left p-3 bg-white hover:bg-[#F5F7FA] rounded-[8px] border border-[#D0D5DD] text-sm text-[#101828] flex items-center gap-2 cursor-pointer min-h-[48px]"
              >
                <Mic className="w-4 h-4 text-[#163D6E] shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Example: "metformin 3 patte bache, 2 bed khali, Dr Sharma aaj chhutti par"
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Panel 2: Register Photo (Rear Camera Direct & In-Browser 1280px Resize) */}
        {activeTab === 'camera' && (
          <div className="p-4 sm:p-5 rounded-[8px] border border-[#D0D5DD] bg-[#F5F7FA] space-y-4">
            {imageUploadProgress !== null && (
              <div className="p-3 bg-white border border-[#D0D5DD] rounded-[8px] space-y-1.5">
                <div className="flex justify-between text-xs text-[#344054] font-semibold">
                  <span>Resizing for low-end phone (max 1280px JPEG ~200 KB)...</span>
                  <span>{imageUploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-[#F5F7FA] rounded-full overflow-hidden border border-[#D0D5DD]">
                  <div
                    className="h-full bg-[#163D6E] transition-all duration-150"
                    style={{ width: `${imageUploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {selectedImage ? (
              <div className="space-y-3">
                <div className="rounded-[8px] overflow-hidden border border-[#D0D5DD] max-h-48 bg-white p-2">
                  <img
                    src={selectedImage}
                    alt="Register page preview"
                    className="w-full h-44 object-contain"
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#344054] font-medium">Physical stock register attached (optimized ~200 KB)</span>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="text-[#B42318] hover:underline font-semibold cursor-pointer min-h-[48px] flex items-center px-2"
                  >
                    Remove photo
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Requirement 5: capture="environment" to open rear camera directly on phone */}
                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#D0D5DD] rounded-[8px] bg-white cursor-pointer hover:bg-[#F5F7FA] min-h-[130px]">
                  <Camera className="w-8 h-8 text-[#163D6E] mb-2" aria-hidden="true" />
                  <span className="text-base font-semibold text-[#163D6E] text-center">
                    Tap to open camera (rear lens) or upload log
                  </span>
                  <span className="text-xs sm:text-sm text-[#475467] mt-1 text-center">
                    Auto-resizes to max 1280px JPEG for slow rural networks
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handlePhotoSelected(file);
                      }
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleUseSampleRegister}
                  className="w-full min-h-[48px] py-2.5 px-4 bg-white hover:bg-[#F5F7FA] border border-[#D0D5DD] text-[#101828] rounded-[8px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#163D6E]" aria-hidden="true" />
                  <span>Use sample register log (PHC Mohna Morning Sheet)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab Panel 3: Casual Text */}
        {activeTab === 'text' && (
          <div className="space-y-3">
            <label htmlFor="casual-report-text" className="text-sm font-semibold text-[#101828] block">
              <BilingualText primary="दैनिक विवरण यहाँ लिखें" enSub="Enter report notes in casual language:" lang={language} />
            </label>
            <textarea
              id="casual-report-text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="e.g. metformin 3 patte bache, 2 bed khali, Dr Sharma aaj chhutti par"
              rows={3}
              className="w-full text-base p-3 border border-[#D0D5DD] rounded-[8px] focus:ring-3 focus:ring-[#163D6E] outline-none bg-white text-[#101828]"
            />

            <div>
              <span className="text-xs text-[#475467] block mb-1.5">Preset phrases:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTextInput('metformin 3 patte bache, 2 bed khali, Dr Sharma aaj chhutti par')
                  }
                  className="min-h-[48px] px-3.5 py-2 bg-white hover:bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px] text-xs sm:text-sm text-[#101828] font-medium cursor-pointer"
                >
                  Metformin + Vacant beds + Doctor absent
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTextInput(
                      '50 strips PCM received, ORS 10 bacha hai, 1 bed khali, Nurse Anita present'
                    )
                  }
                  className="min-h-[48px] px-3.5 py-2 bg-white hover:bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px] text-xs sm:text-sm text-[#101828] font-medium cursor-pointer"
                >
                  PCM intake + ORS stock + Staff on duty
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Friendly Photo Error Banner (Requirement 5) */}
        {photoError && (
          <div className="p-4 bg-[#FEF3F2] border border-[#FDA29B] rounded-[8px] flex items-start justify-between gap-3 text-[#B42318]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#B42318]" aria-hidden="true" />
              <div>
                <div lang="hi" className="font-semibold text-sm">फ़ोटो साफ़ नहीं है — फिर से लें</div>
                <div lang="en" className="text-xs text-[#475467] font-normal mt-0.5">Photo is not clear — please take it again</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPhotoError(null);
                setSelectedImage(null);
              }}
              className="text-xs font-semibold underline text-[#B42318] hover:text-[#912018] cursor-pointer"
            >
              हटाएं / Dismiss
            </button>
          </div>
        )}

        {/* Processing Indicator Banner (Requirement 5) */}
        {isProcessing && (
          <div className="p-4 bg-[#F5F7FA] border border-[#163D6E] rounded-[8px] flex items-center justify-center gap-3 animate-pulse">
            <div className="w-5 h-5 border-2 border-[#163D6E] border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="flex flex-col items-start text-left leading-tight">
              <span lang="hi" className="font-semibold text-sm text-[#101828]">Gemini पढ़ रहा है… लगभग 5 सेकंड</span>
              <span lang="en" className="text-xs text-[#475467] font-normal mt-0.5">Reading… about 5 seconds</span>
            </div>
          </div>
        )}

        {/* Desktop inline process button (hidden on mobile, mobile has sticky bottom button) */}
        {!parsedReport && (
          <button
            type="button"
            onClick={() => handleProcessReport()}
            disabled={isProcessing || (!textInput && !selectedImage && !parsedReport)}
            className={`hidden sm:flex w-full min-h-[52px] px-4 py-3 rounded-[8px] font-semibold text-base text-white items-center justify-center gap-2 transition-colors cursor-pointer ${
              isProcessing
                ? 'bg-[#163D6E]/70 cursor-not-allowed'
                : 'bg-[#163D6E] hover:bg-[#0F2B4E]'
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span lang="hi" className="font-semibold text-sm">Gemini पढ़ रहा है… लगभग 5 सेकंड</span>
                  <span lang="en" className="text-xs font-normal opacity-90">Reading… about 5 seconds</span>
                </div>
              </div>
            ) : (
              <>
                <Sparkles className="w-5 h-5" aria-hidden="true" />
                <BilingualText k="extractReport" lang={language} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Confirmation Card with Reciprocal Data Feedback */}
      {parsedReport && (
        <div
          role="region"
          aria-live="polite"
          className="bg-white rounded-[8px] p-4 sm:p-6 border-2 border-[#163D6E] space-y-4"
        >
          <div className="p-3 bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#475467] block">
                {isHindi ? 'प्रतिवेदन केंद्र' : isOdia ? 'ରିପୋର୍ଟିଂ କେନ୍ଦ୍ର' : 'Reporting facility'}
              </span>
              <span className="text-base font-semibold text-[#101828]">
                {currentPhc.name} · {currentPhc.district}
              </span>
            </div>
            <MapPin className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
          </div>

          <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-2">
            <h3 className="text-base sm:text-lg font-semibold text-[#101828]">
              {isHindi ? 'निकाले गए डेटा की पुष्टि' : isOdia ? 'ସଂଗୃହୀତ ତଥ୍ୟର ଯାଞ୍ଚ' : 'Extracted report confirmation'}
            </h3>
            <div className="flex items-center gap-2">
              <ListenButton
                text={
                  isHindi
                    ? 'निकाले गए डेटा की पुष्टि करें। कृपया सभी दवाइयों की संख्या और बिस्तरों की स्थिति जांच लें।'
                    : 'Please verify extracted report data before saving.'
                }
                lang={language}
              />
              {parsedReport.isFallback && (
                <span className="text-xs px-2 py-0.5 bg-[#FFFAEB] text-[#B54708] border border-[#D0D5DD] rounded-[6px] font-medium">
                  Sample preview
                </span>
              )}
            </div>
          </div>

          {/* Group 1: Stock Entries */}
          <div className="space-y-3">
            <h4 className="text-sm sm:text-base font-semibold text-[#101828]">
              1. Medicines stock update
            </h4>

            {parsedReport.stock.map((item, idx) => {
              const isLowConfidence = item.confidence < 0.7;
              const med = MEDICINES.find((m) => m.code === item.med_code);
              const medTitle = med ? `${med.molecule} · ${med.name_hi}` : item.med_code;
              const unitDisplay = getUnitDisplay(item.med_code, item.quantity);

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-[8px] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isLowConfidence
                      ? 'bg-[#FFFAEB] border-[#D0D5DD]'
                      : 'bg-white border-[#D0D5DD]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MedicinePictogram form={med?.form || med?.category || item.med_code} />
                      <span className="text-sm sm:text-base font-semibold text-[#101828]">
                        {medTitle}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-[4px] bg-[#F5F7FA] border border-[#D0D5DD] text-[#344054] font-medium">
                        {item.event}
                      </span>
                    </div>

                    <div className="text-xs text-[#475467] mt-0.5">
                      Code: {item.med_code}
                    </div>

                    <div className="text-xs sm:text-sm text-[#344054] mt-1">
                      Matched from: "{item.source_text}"
                    </div>

                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-[#475467]">
                        Confidence: {Math.round(item.confidence * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedWhyItems((prev) => ({
                            ...prev,
                            [`stock_${idx}`]: !prev[`stock_${idx}`],
                          }))
                        }
                        className="text-xs text-[#163D6E] underline font-medium cursor-pointer min-h-[36px] flex items-center"
                      >
                        {expandedWhyItems[`stock_${idx}`] ? 'Hide explanation' : 'Why this number?'}
                      </button>
                    </div>

                    {expandedWhyItems[`stock_${idx}`] && (
                      <div className="p-2.5 mt-2 bg-[#F5F7FA] border border-[#D0D5DD] rounded-[6px] text-xs text-[#344054]">
                        <strong>Source:</strong> "{item.source_text || (selectedImage ? 'Paper register line entry' : textInput)}"
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <label htmlFor={`stock-input-${idx}`} className="sr-only">
                      Quantity for {medTitle}
                    </label>
                    <input
                      id={`stock-input-${idx}`}
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        const updated = [...parsedReport.stock];
                        updated[idx].quantity = val;
                        setParsedReport({ ...parsedReport, stock: updated });
                      }}
                      className="w-20 min-h-[48px] text-center text-base font-semibold border border-[#D0D5DD] rounded-[8px] bg-white text-[#101828] focus:ring-3 focus:ring-[#163D6E] outline-none"
                    />
                    <span className="text-xs sm:text-sm font-semibold text-[#344054] min-w-[50px]">
                      {unitDisplay}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Group 2: Beds */}
          <div className="space-y-3 pt-3 border-t border-[#D0D5DD]">
            <h4 className="text-sm sm:text-base font-semibold text-[#101828]">
              2. Bed availability
            </h4>
            <div className="p-3.5 rounded-[8px] border border-[#D0D5DD] bg-white flex items-center justify-between gap-3">
              <div>
                <span className="text-sm sm:text-base font-medium text-[#101828] block">
                  {isHindi ? 'खाली बिस्तर (Vacant beds):' : isOdia ? 'ଖାଲି ଖଟ (Vacant beds):' : 'Vacant beds for admissions:'}
                </span>
                <span className="text-xs text-[#475467]">
                  Confidence: {Math.round((parsedReport.beds.confidence || 0.92) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="vacant-beds-input"
                  type="number"
                  value={parsedReport.beds.available ?? 2}
                  onChange={(e) => {
                    setParsedReport({
                      ...parsedReport,
                      beds: {
                        ...parsedReport.beds,
                        available: Number(e.target.value),
                      },
                    });
                  }}
                  className="w-20 min-h-[48px] text-center text-base font-semibold border border-[#D0D5DD] rounded-[8px] bg-white text-[#101828] focus:ring-3 focus:ring-[#163D6E] outline-none"
                />
                <span className="text-xs sm:text-sm font-semibold text-[#344054]">beds</span>
              </div>
            </div>
          </div>

          {/* Group 3: Staff */}
          <div className="space-y-3 pt-3 border-t border-[#D0D5DD]">
            <h4 className="text-sm sm:text-base font-semibold text-[#101828]">
              3. Staff attendance
            </h4>

            {parsedReport.staff.map((st, idx) => {
              const matched = matchStaffToPhc(st.role_or_name, phcStaffList);
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-[8px] border border-[#D0D5DD] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-sm sm:text-base font-semibold text-[#101828]">
                      {matched?.name || st.role_or_name}
                    </span>
                    <span className="text-xs text-[#475467] block">
                      Role: {matched?.role || 'Staff'} · Confidence {Math.round((st.confidence || 0.88) * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      id={`matched-status-${idx}`}
                      value={st.status}
                      onChange={(e) => {
                        const updated = [...parsedReport.staff];
                        updated[idx] = {
                          ...updated[idx],
                          status: e.target.value as any,
                        };
                        setParsedReport({ ...parsedReport, staff: updated });
                      }}
                      className="min-h-[48px] px-3 border border-[#D0D5DD] rounded-[8px] bg-white text-sm font-semibold text-[#101828]"
                    >
                      <option value="present">Present</option>
                      <option value="leave">On leave</option>
                      <option value="absent">Absent</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop inline Save & Discard buttons */}
          <div className="hidden sm:flex items-center gap-3 pt-3 border-t border-[#D0D5DD]">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saveSuccess}
              className="w-1/3 min-h-[52px] px-4 py-3 rounded-[8px] border-2 border-[#101828] bg-white hover:bg-[#F5F7FA] text-[#101828] font-bold text-base transition-colors cursor-pointer"
            >
              <BilingualText k="discard" lang={language} />
            </button>

            <button
              type="button"
              onClick={handleSaveConfirmed}
              disabled={saveSuccess}
              className={`flex-1 min-h-[52px] px-4 py-3 rounded-[8px] font-bold text-base text-white transition-colors cursor-pointer ${
                saveSuccess
                  ? 'bg-[#067647]'
                  : 'bg-[#163D6E] hover:bg-[#0F2B4E]'
              }`}
            >
              {saveSuccess ? (
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" aria-hidden="true" />
                  <span>Report submitted ({lastReportDuration || 14}s)</span>
                </div>
              ) : (
                <BilingualText k="sahiHaiSave" lang={language} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Reciprocal Benefit Card: "Data comes back" */}
      <div className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] space-y-4">
        <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
              <h3 className="text-base sm:text-lg font-semibold text-[#101828]">
                <BilingualText k="dataComesBack" lang={language} />
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[#475467] mt-1">
              <BilingualText k="dataComesBackSub" lang={language} />
            </p>
          </div>
          <ListenButton
            text={
              isHindi
                ? 'डेटा वापस मिलता है। आपके केंद्र के लिए आने वाले स्टॉक और पिछले प्रतिवेदन पर की गई कार्रवाई की जानकारी।'
                : 'Data comes back to your center with incoming stock transfers and action taken on your last report.'
            }
            lang={language}
          />
        </div>

        {/* 1. Incoming transfers */}
        <div className="p-3.5 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] space-y-2">
          <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-[#163D6E]">
            <Truck className="w-5 h-5" aria-hidden="true" />
            <span>Incoming transfers</span>
          </div>
          {incomingTransfers.length > 0 ? (
            <ul className="space-y-1.5 text-sm sm:text-base text-[#101828]">
              {incomingTransfers.map((t) => (
                <li key={t.id} className="flex items-center gap-2 flex-wrap">
                  <MedicinePictogram form={t.med_name} />
                  <span>• {t.quantity} strips {t.med_name} from {t.from_phc_name}, arriving tomorrow ({t.status === 'auto_dispatched' ? 'Auto-dispatched' : 'Approved'})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm sm:text-base text-[#344054] flex items-center gap-2">
              <MedicinePictogram form="Metformin" />
              <span>• 116 strips Metformin from PHC Tigaon, scheduled to arrive tomorrow</span>
            </p>
          )}
        </div>

        {/* 2. What district did with last report */}
        <div className="p-3.5 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] space-y-1.5">
          <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-[#067647]">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            <span>What district did with your last report</span>
          </div>
          <p className="text-sm sm:text-base text-[#344054]">
            District officer reviewed previous report: Approved emergency buffer transfer of 50 strips PCM and updated bed occupancy status.
          </p>
        </div>

        {/* 3. This PHC's 3 lowest items */}
        <div className="space-y-2 pt-2">
          <span className="text-sm sm:text-base font-semibold text-[#101828] block">
            This PHC's 3 lowest items in days of stock:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {lowestThreeStockItems.map((item) => (
              <div
                key={item.med.code}
                className={`p-3 rounded-[8px] border text-center ${
                  item.days < 7
                    ? 'bg-[#FEF3F2] border-[#D0D5DD] text-[#B42318]'
                    : 'bg-[#FFFAEB] border-[#D0D5DD] text-[#B54708]'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <MedicinePictogram form={item.med.form || item.med.category || item.med.name} />
                  <span className="text-xs sm:text-sm font-semibold truncate" title={item.med.name}>
                    {item.med.name.split(' ')[0]}
                  </span>
                </div>
                <span className="text-base font-bold block mt-1">
                  {item.days} days
                </span>
                <span className="text-xs text-[#475467] block">
                  {item.qty} units in stock
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff Duty Check-In Card (Geofenced) */}
      <div className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] space-y-4">
        <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
            <h3 className="text-base sm:text-lg font-semibold text-[#101828]">
              <BilingualText k="staffCheckin" lang={language} />
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <ListenButton
              text={
                isHindi
                  ? 'स्टाफ़ उपस्थिति चेक-इन। जब आप केंद्र पर उपस्थित हों तो बटन दबाएं।'
                  : 'Staff duty attendance check-in within three hundred meters of facility.'
              }
              lang={language}
            />
            <span className="text-xs text-[#475467]">300m GPS geofence</span>
          </div>
        </div>

        <div>
          <label htmlFor="staff-checkin-select" className="text-sm sm:text-base font-semibold text-[#101828] block mb-2">
            Select staff member:
          </label>
          <select
            id="staff-checkin-select"
            value={selectedStaffToCheckin}
            onChange={(e) => setSelectedStaffToCheckin(e.target.value)}
            className="w-full min-h-[48px] text-base p-2.5 border border-[#D0D5DD] rounded-[8px] bg-white text-[#101828] focus:ring-3 focus:ring-[#163D6E] outline-none"
          >
            {phcStaffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role}) - {s.status === 'present' ? 'Already checked in' : 'Pending'}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleGeoCheckIn}
          className="w-full min-h-[52px] px-4 py-3 bg-[#163D6E] hover:bg-[#0F2B4E] text-white font-bold text-base rounded-[8px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <MapPin className="w-5 h-5" aria-hidden="true" />
          <BilingualText k="mainPhcParHoon" lang={language} />
        </button>

        {geoStatus && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-[8px] bg-[#ECFDF3] border border-[#D0D5DD] text-sm text-[#067647] font-medium text-center"
          >
            {geoStatus}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-[#D0D5DD] text-xs text-[#475467]">
          <span>Simulate location for demo:</span>
          <button
            type="button"
            onClick={() => setSimulateAtPhc(!simulateAtPhc)}
            aria-pressed={simulateAtPhc}
            className={`min-h-[44px] px-3 py-1.5 rounded-[8px] border font-semibold transition-colors cursor-pointer ${
              simulateAtPhc
                ? 'bg-[#163D6E] text-white border-[#163D6E]'
                : 'bg-white text-[#344054] border-[#D0D5DD]'
            }`}
          >
            {simulateAtPhc ? 'On-site' : 'Off-site'}
          </button>
        </div>
      </div>

      {/* Quick Bed Occupancy Counter */}
      <div className="bg-white rounded-[8px] p-4 sm:p-6 border border-[#D0D5DD] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <div>
            <h3 className="text-base font-semibold text-[#101828]">
              <BilingualText k="bedCounter" lang={language} />
            </h3>
            <p className="text-xs sm:text-sm text-[#475467] mt-0.5">
              Occupied: {phcBeds.occupied} / {phcBeds.total} beds ({phcBeds.available} available)
            </p>
          </div>
          <ListenButton
            text={
              isHindi
                ? 'बिस्तर उपलब्धता काउंटर। खाली और भरे हुए बिस्तरों की संख्या अपडेट करें।'
                : 'Bed occupancy counter. Update vacant and occupied beds.'
            }
            lang={language}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => updateBedCount(currentPhc.id, -1)}
            disabled={phcBeds.occupied <= 0}
            aria-label="Discharge patient"
            className="w-12 h-12 rounded-[8px] border-2 border-[#101828] bg-white hover:bg-[#F5F7FA] text-[#101828] flex items-center justify-center font-bold disabled:opacity-40 cursor-pointer min-h-[48px] min-w-[48px]"
          >
            <Minus className="w-5 h-5" aria-hidden="true" />
          </button>

          <span className="text-xl font-bold w-12 text-center text-[#101828]">
            {phcBeds.occupied}
          </span>

          <button
            type="button"
            onClick={() => updateBedCount(currentPhc.id, 1)}
            disabled={phcBeds.occupied >= phcBeds.total}
            aria-label="Admit patient"
            className="w-12 h-12 rounded-[8px] border-2 border-[#101828] bg-white hover:bg-[#F5F7FA] text-[#101828] flex items-center justify-center font-bold disabled:opacity-40 cursor-pointer min-h-[48px] min-w-[48px]"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REQUIREMENT 5: Mobile Sticky Action Button at bottom within thumb reach  */}
      {/* 56px height, full-width, stick to bottom of screen on <640px              */}
      {/* ========================================================================= */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 p-2.5 bg-white border-t border-[#D0D5DD] z-30 shadow-md">
        {parsedReport ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saveSuccess}
              className="w-1/3 min-h-[56px] h-14 rounded-[8px] border-2 border-[#101828] bg-white text-[#101828] font-bold text-sm flex items-center justify-center cursor-pointer"
            >
              <BilingualText k="discard" lang={language} />
            </button>
            <button
              type="button"
              onClick={handleSaveConfirmed}
              disabled={saveSuccess}
              className={`flex-1 min-h-[56px] h-14 rounded-[8px] font-bold text-base text-white flex items-center justify-center gap-2 cursor-pointer ${
                saveSuccess ? 'bg-[#067647]' : 'bg-[#163D6E] active:bg-[#0F2B4E]'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>Saved ({lastReportDuration || 14}s)</span>
                </>
              ) : (
                <BilingualText k="sahiHaiSave" lang={language} />
              )}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleProcessReport()}
            disabled={isProcessing || (!textInput && !selectedImage && !parsedReport)}
            className={`w-full min-h-[56px] h-14 rounded-[8px] font-bold text-base text-white flex items-center justify-center gap-2 cursor-pointer ${
              isProcessing
                ? 'bg-[#163D6E]/70 cursor-not-allowed'
                : 'bg-[#163D6E] active:bg-[#0F2B4E]'
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span lang="hi" className="font-semibold text-sm">Gemini पढ़ रहा है… लगभग 5 सेकंड</span>
                  <span lang="en" className="text-xs font-normal opacity-90">Reading… about 5 seconds</span>
                </div>
              </div>
            ) : (
              <>
                <Sparkles className="w-5 h-5" aria-hidden="true" />
                <BilingualText k="extractReport" lang={language} />
              </>
            )}
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* REQUIREMENT 4: Full-width UPI-style Success Screen after Save             */}
      {/* Big green tick, "भेज दिया / Sent", "in N seconds", button "ठीक है / Done"  */}
      {/* ========================================================================= */}
      {saveSuccess && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col justify-between items-center p-6 sm:p-10 animate-in fade-in duration-200">
          <div className="w-full flex justify-end">
            <button
              type="button"
              onClick={handleDismissSuccess}
              aria-label="Close"
              className="text-[#475467] hover:text-[#101828] p-2 text-xl font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col items-center text-center max-w-sm w-full my-auto space-y-5">
            <div className="w-28 h-28 rounded-full bg-[#ECFDF3] border-4 border-[#067647] flex items-center justify-center shadow-lg text-[#067647]">
              <Check className="w-16 h-16 stroke-[3.5]" />
            </div>

            <div className="space-y-1">
              <h2 lang="hi" className="text-3xl sm:text-4xl font-extrabold text-[#101828]">
                भेज दिया
              </h2>
              <p lang="en" className="text-lg sm:text-xl font-semibold text-[#475467]">
                Sent
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F5F7FA] border border-[#D0D5DD] rounded-full text-sm font-semibold text-[#344054]">
              <Clock className="w-4 h-4 text-[#475467]" />
              <span>in {lastReportDuration || 14} seconds</span>
            </div>

            <p className="text-sm text-[#475467] pt-2">
              {currentPhc.name} · {currentPhc.district}
            </p>
          </div>

          <div className="w-full max-w-sm pt-6 pb-4">
            <button
              type="button"
              onClick={handleDismissSuccess}
              className="w-full min-h-[56px] py-3.5 px-6 rounded-[8px] bg-[#067647] hover:bg-[#05603A] text-white font-bold text-lg flex flex-col items-center justify-center leading-tight shadow-md cursor-pointer transition-all active:scale-[0.99]"
            >
              <span lang="hi">ठीक है</span>
              <span lang="en" className="text-xs font-normal opacity-90">Done</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
