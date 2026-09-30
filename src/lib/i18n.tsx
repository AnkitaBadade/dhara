import React from 'react';
import { AppLanguage, StateCode, UserRole } from '../types';

export function getDefaultLanguage(role: UserRole, state: StateCode): AppLanguage {
  if (role === 'phc_staff' || role === 'citizen') {
    return state === 'OD' ? 'or' : 'hi';
  }
  return 'en';
}

/**
 * Format days ago with correct plurals in English, Hindi, and Odia.
 * Requirement: "1 day ago / कल", "2 days ago / 2 दिन पहले". Never "1 days".
 */
export function formatDaysAgo(
  days: number,
  lang: AppLanguage
): { primary: string; sub?: string; fullText: string } {
  if (days <= 0) {
    if (lang === 'hi') {
      return {
        primary: 'आज अपडेट हुआ',
        sub: 'Updated today',
        fullText: 'आज अपडेट हुआ',
      };
    }
    if (lang === 'or') {
      return {
        primary: 'ଆଜି ଅପଡେଟ୍ ହେଲା',
        sub: 'Updated today',
        fullText: 'ଆଜି ଅପଡେଟ୍ ହେଲା',
      };
    }
    return {
      primary: 'Updated today',
      fullText: 'Updated today',
    };
  }

  if (days === 1) {
    if (lang === 'hi') {
      return {
        primary: 'कल',
        sub: '1 day ago',
        fullText: 'कल',
      };
    }
    if (lang === 'or') {
      return {
        primary: 'ଗତକାଲି',
        sub: '1 day ago',
        fullText: 'ଗତକାଲି',
      };
    }
    return {
      primary: '1 day ago',
      fullText: '1 day ago',
    };
  }

  // days > 1
  if (lang === 'hi') {
    return {
      primary: `${days} दिन पहले`,
      sub: `${days} days ago`,
      fullText: `${days} दिन पहले`,
    };
  }
  if (lang === 'or') {
    return {
      primary: `${days} ଦିନ ପୂର୍ବେ`,
      sub: `${days} days ago`,
      fullText: `${days} ଦିନ ପୂର୍ବେ`,
    };
  }
  return {
    primary: `${days} days ago`,
    fullText: `${days} days ago`,
  };
}

export interface I18nItem {
  en: string;
  hi: string;
  or: string;
}

export const DICTIONARY: Record<string, I18nItem> = {
  // Brand & Header
  appTitle: {
    en: 'Dhara',
    hi: 'धारा',
    or: 'ଧାରା',
  },
  appSubtitle: {
    en: 'Prototype for PHC resource management · Synthetic data · Not an official service',
    hi: 'प्राथमिक स्वास्थ्य केंद्र संसाधन प्रबंधन प्रोटोटाइप · कृत्रिम डेटा · आधिकारिक सेवा नहीं',
    or: 'ପିଏଚ୍‌ସି ସମ୍ବଳ ପରିଚାଳନା ପ୍ରୋଟୋଟାଇପ୍ · କୃତ୍ରିମ ତଥ୍ୟ · ସରକାରୀ ସେବା ନୁହେଁ',
  },
  skipToContent: {
    en: 'Skip to main content',
    hi: 'मुख्य सामग्री पर जाएं',
    or: 'ମୁଖ୍ୟ ବିଷୟବସ୍ତୁକୁ ଯାଆନ୍ତୁ',
  },
  accessibilityOptions: {
    en: 'Accessibility options',
    hi: 'सुलभता विकल्प',
    or: 'ସୁଗମତା ବିକଳ୍ପ',
  },
  highContrast: {
    en: 'High contrast',
    hi: 'उच्च कंट्रास्ट',
    or: 'ଉଚ୍ଚ କଣ୍ଟ୍ରାଷ୍ଟ',
  },
  normalContrast: {
    en: 'Standard contrast',
    hi: 'सामान्य कंट्रास्ट',
    or: 'ସାଧାରଣ କଣ୍ଟ୍ରାଷ୍ଟ',
  },
  textSize: {
    en: 'Text size',
    hi: 'अक्षर आकार',
    or: 'ଅକ୍ଷର ଆକାର',
  },
  menu: {
    en: 'Menu',
    hi: 'मेनू',
    or: 'ମେନୁ',
  },
  close: {
    en: 'Close',
    hi: 'बंद करें',
    or: 'ବନ୍ଦ କରନ୍ତୁ',
  },

  // Roles
  roleStaff: {
    en: 'PHC Staff',
    hi: 'पीएचसी स्टाफ़',
    or: 'ପିଏଚ୍‌ସି କର୍ମଚାରୀ',
  },
  roleDistrict: {
    en: 'District Officer',
    hi: 'ज़िला अधिकारी',
    or: 'ଜିଲ୍ଲା ଅଧିକାରୀ',
  },
  roleState: {
    en: 'State Hub',
    hi: 'राज्य हब',
    or: 'ରାଜ୍ୟ ହବ୍',
  },
  roleCitizen: {
    en: 'Citizen',
    hi: 'नागरिक',
    or: 'ନାଗରିକ',
  },

  // States
  stateHaryana: {
    en: 'Haryana',
    hi: 'हरियाणा',
    or: 'ହରିୟାଣା',
  },
  stateOdisha: {
    en: 'Odisha',
    hi: 'ओडिशा',
    or: 'ଓଡ଼ିଶା',
  },

  // Common Statuses
  critical: {
    en: 'Critical',
    hi: 'गंभीर कमी',
    or: 'ସଙ୍କଟଜନକ',
  },
  low: {
    en: 'Low',
    hi: 'कम स्टॉक',
    or: 'କମ୍ ଷ୍ଟକ୍',
  },
  ok: {
    en: 'OK',
    hi: 'पर्याप्त',
    or: 'ଠିକ୍ ଅଛି',
  },
  oldData: {
    en: 'Old data',
    hi: 'पुराना डेटा',
    or: 'ପୁରୁଣା ତଥ୍ୟ',
  },
  available: {
    en: 'Available',
    hi: 'उपलब्ध',
    or: 'ଉପଲବ୍ଧ',
  },
  outOfStock: {
    en: 'Out of stock',
    hi: 'स्टॉक समाप्त',
    or: 'ଷ୍ଟକ୍ ନାହିଁ',
  },
  present: {
    en: 'Present',
    hi: 'उपस्थित',
    or: 'ଉପସ୍ଥିତ',
  },
  onLeave: {
    en: 'On leave',
    hi: 'छुट्टी पर',
    or: 'ଛୁଟିରେ',
  },
  absent: {
    en: 'Absent',
    hi: 'अनुपस्थित',
    or: 'ଅନୁପସ୍ଥିତ',
  },

  // PHC Staff screen
  selectPhc: {
    en: 'Select Primary Health Centre',
    hi: 'प्राथमिक स्वास्थ्य केंद्र चुनें',
    or: 'ପ୍ରାଥମିକ ସ୍ୱାସ୍ଥ୍ୟ କେନ୍ଦ୍ର ବାଛନ୍ତୁ',
  },
  universalReport: {
    en: 'Universal daily report',
    hi: 'दैनिक स्टॉक एवं उपस्थिति प्रतिवेदन',
    or: 'ଦୈନିକ ଷ୍ଟକ୍ ଏବଂ ଉପସ୍ଥିତି ରିପୋର୍ଟ',
  },
  reportSubtitle: {
    en: 'Voice note, register photo, or casual message in Hindi, Odia, or English',
    hi: 'वॉइस नोट, रजिस्टर फोटो, या सामान्य संदेश (हिंदी, ओडिया, अंग्रेज़ी)',
    or: 'ଭଏସ୍ ନୋଟ୍, ରେଜିଷ୍ଟର ଫଟୋ, କିମ୍ବା ସାଧାରଣ ବାର୍ତ୍ତା (ଓଡ଼ିଆ, ହିନ୍ଦୀ, ଇଂରାଜୀ)',
  },
  voiceNote: {
    en: 'Voice note',
    hi: 'वॉइस नोट',
    or: 'ଭଏସ୍ ନୋଟ୍',
  },
  voiceNoteSub: {
    en: 'Speak in Hindi or Odia',
    hi: 'हिंदी या ओडिया में बोलें',
    or: 'ଓଡ଼ିଆ କିମ୍ବା ହିନ୍ଦୀରେ କୁହନ୍ତୁ',
  },
  registerPhoto: {
    en: 'Register photo',
    hi: 'रजिस्टर फोटो',
    or: 'ରେଜିଷ୍ଟର ଫଟୋ',
  },
  registerPhotoSub: {
    en: 'Rear camera snapshot',
    hi: 'कैमरे से फोटो लें',
    or: 'କ୍ୟାମେରାରୁ ଫଟୋ ନିଅନ୍ତୁ',
  },
  casualText: {
    en: 'Casual text',
    hi: 'सामान्य संदेश',
    or: 'ସାଧାରଣ ଟାଇପ୍',
  },
  casualTextSub: {
    en: 'Type in everyday words',
    hi: 'दैनिक शब्दों में लिखें',
    or: 'ଦୈନନ୍ଦିନ ଭାଷାରେ ଲେଖନ୍ତୁ',
  },
  tapToRecord: {
    en: 'Tap to record voice',
    hi: 'आवाज़ रिकॉर्ड करने के लिए दबाएं',
    or: 'ଭଏସ୍ ରେକର୍ଡ କରିବାକୁ ଦବାନ୍ତୁ',
  },
  stopRecording: {
    en: 'Stop recording',
    hi: 'रिकॉर्डिंग रोकें',
    or: 'ରେକର୍ଡିଂ ବନ୍ଦ କରନ୍ତୁ',
  },
  extractReport: {
    en: 'Extract report entries',
    hi: 'डेटा निकालें और जांचें',
    or: 'ତଥ୍ୟ ସଂଗ୍ରହ କରନ୍ତୁ',
  },
  extracting: {
    en: 'Reading… about 5 seconds',
    hi: 'Gemini पढ़ रहा है… लगभग 5 सेकंड',
    or: 'Gemini ପଢୁଛି… ପ୍ରାୟ ୫ ସେକେଣ୍ଡ',
  },
  sahiHaiSave: {
    en: 'Sahi hai — Save report',
    hi: 'सही है — सहेजें',
    or: 'ଠିକ୍ ଅଛି — ସାଇତନ୍ତୁ',
  },
  discard: {
    en: 'Discard report',
    hi: 'रद्द करें',
    or: 'ବାତିଲ କରନ୍ତୁ',
  },
  dataComesBack: {
    en: 'Data comes back',
    hi: 'डेटा का तुरंत लाभ',
    or: 'ତଥ୍ୟର ତୁରନ୍ତ ଲାଭ',
  },
  dataComesBackSub: {
    en: 'Staff always receive actionable feedback for the reporting data they submit',
    hi: 'दी गई जानकारी के बदले स्वास्थ्य कर्मियों को तुरंत आपूर्ति की जानकारी मिलती है',
    or: 'ପ୍ରଦତ୍ତ ତଥ୍ୟ ବଦଳରେ କର୍ମଚାରୀମାନଙ୍କୁ ସଙ୍ଗେ ସଙ୍ଗେ ସହାୟକ ତଥ୍ୟ ମିଳେ',
  },
  staffCheckin: {
    en: 'Staff duty check-in',
    hi: 'स्टाफ़ उपस्थिति चेक-इन',
    or: 'କର୍ମଚାରୀ ଉପସ୍ଥିତି ଚେକ୍-ଇନ୍',
  },
  mainPhcParHoon: {
    en: 'Main PHC par hoon (Register check-in)',
    hi: 'मैं पीएचसी पर उपस्थित हूँ (चेक-इन)',
    or: 'ମୁଁ ପିଏଚ୍‌ସିରେ ଉପସ୍ଥିତ ଅଛି (ଚେକ୍-ଇନ୍)',
  },
  bedCounter: {
    en: 'Quick bed occupancy counter',
    hi: 'बिस्तर उपलब्धता काउंटर',
    or: 'ଖଟ ଉପଲବ୍ଧତା କାଉଣ୍ଟର',
  },
  admitPatient: {
    en: 'Admit patient (+1 occupied)',
    hi: 'मरीज़ भर्ती (+1)',
    or: 'ରୋଗୀ ଭର୍ତ୍ତି (+1)',
  },
  dischargePatient: {
    en: 'Discharge patient (-1 occupied)',
    hi: 'मरीज़ डिस्चार्ज (-1)',
    or: 'ରୋଗୀ ଡିସଚାର୍ଜ (-1)',
  },

  // District Officer screen
  todays3Actions: {
    en: "Today's 3 actions",
    hi: 'आज की 3 मुख्य कार्रवाइयां',
    or: 'ଆଜିର ୩ଟି ମୁଖ୍ୟ ପଦକ୍ଷେପ',
  },
  todays3ActionsSub: {
    en: 'What to do, why, and one-click execution',
    hi: 'क्या करना है, क्यों, और एक क्लिक में समाधान',
    or: 'କ’ଣ କରିବାକୁ ହେବ, କାହିଁକି, ଏବଂ ଏକ କ୍ଲିକରେ କାର୍ଯ୍ୟାନୁଷ୍ଠାନ',
  },
  mapView: {
    en: 'Map view',
    hi: 'मानचित्र दृश्य',
    or: 'ମାନଚିତ୍ର ଦୃଶ୍ୟ',
  },
  listView: {
    en: 'View as list',
    hi: 'सूची के रूप में देखें',
    or: 'ତାଲିକା ଭାବେ ଦେଖନ୍ତୁ',
  },
  resourceGrid: {
    en: 'PHC supply & resource matrix',
    hi: 'पीएचसी आपूर्ति एवं संसाधन ग्रिड',
    or: 'ପିଏଚ୍‌ସି ଯୋଗାଣ ଏବଂ ସମ୍ବଳ ଗ୍ରୀଡ୍',
  },

  // Citizen screen
  citizenTitle: {
    en: 'Find medicines, beds, and doctors at your local PHC',
    hi: 'अपने स्थानीय स्वास्थ्य केंद्र पर दवा, बिस्तर और डॉक्टर की उपलब्धता जानें',
    or: 'ଆପଣଙ୍କ ସ୍ଥାନୀୟ ସ୍ୱାସ୍ଥ୍ୟ କେନ୍ଦ୍ରରେ ଔଷଧ, ଖଟ ଏବଂ ଡାକ୍ତରଙ୍କ ସୂଚନା ପାଆନ୍ତୁ',
  },
  citizenSubtitle: {
    en: 'Ask any question in Hindi, Odia, or English. All answers are verified directly against live hospital stock registers.',
    hi: 'हिंदी, ओडिया या अंग्रेज़ी में पूछें। सभी उत्तर सीधे अस्पताल के लाइव रजिस्टर से सत्यापित होते हैं।',
    or: 'ଓଡ଼ିଆ, ହିନ୍ଦୀ କିମ୍ବା ଇଂରାଜୀରେ ପଚାରନ୍ତୁ। ସମସ୍ତ ଉତ୍ତର ହସ୍ପିଟାଲର ଲାଇଭ୍ ରେଜିଷ୍ଟର ସହ ଯାଞ୍ଚ ହୋଇଥାଏ।',
  },
  searchPlaceholder: {
    en: 'e.g. Punhana mein BP ki goli milegi? or Pipili PHC re bed achhi ki?',
    hi: 'उदा. पुनहाना में बीपी की गोली मिलेगी? या पिपिली पीएचसी में बेड है क्या?',
    or: 'ଯଥା: ପିପିଲି ପିଏଚ୍‌ସିରେ ଖଟ ଅଛି କି? କିମ୍ବା ବିପି ଔଷଧ ମିଳିବ କି?',
  },
  searchButton: {
    en: 'Search',
    hi: 'खोजें',
    or: 'ଖୋଜନ୍ତୁ',
  },
  verifiedAnswer: {
    en: 'Verified answer',
    hi: 'सत्यापित उत्तर',
    or: 'ଯାଞ୍ଚ ହୋଇଥିବା ଉତ୍ତର',
  },

  // Footer
  footerText: {
    en: 'Prototype v1.0 · No patient data collected · Design principles',
    hi: 'प्रोटोटाइप v1.0 · कोई मरीज़ डेटा संग्रहीत नहीं · डिज़ाइन सिद्धांत',
    or: 'ପ୍ରୋଟୋଟାଇପ୍ v1.0 · କୌଣସି ରୋଗୀ ତଥ୍ୟ ସଂଗୃହୀତ ନୁହେଁ · ଡିଜାଇନ୍ ନୀତି',
  },
};

/**
 * Returns the localized text structure:
 * - English: English only
 * - Hindi: Hindi primary, small English below
 * - Odia: Odia primary, small English below
 */
export function t(key: string, lang: AppLanguage): { primary: string; sub?: string } {
  const item = DICTIONARY[key];
  if (!item) {
    return { primary: key };
  }

  if (lang === 'en') {
    return { primary: item.en };
  }

  if (lang === 'hi') {
    return { primary: item.hi, sub: item.en };
  }

  if (lang === 'or') {
    return { primary: item.or, sub: item.en };
  }

  return { primary: item.en };
}

/**
 * Reusable Bilingual text component:
 * When lang is 'hi' or 'or': renders primary script on top and small English below.
 * When lang is 'en': renders English only.
 */
export const BilingualText: React.FC<{
  k?: string;
  primary?: string;
  enSub?: string;
  lang: AppLanguage;
  className?: string;
  primaryClassName?: string;
  subClassName?: string;
}> = ({ k, primary, enSub, lang, className = '', primaryClassName = '', subClassName = '' }) => {
  let mainText = primary || '';
  let secondaryText = enSub;

  if (k && DICTIONARY[k]) {
    const item = DICTIONARY[k];
    if (lang === 'en') {
      mainText = item.en;
      secondaryText = undefined;
    } else if (lang === 'hi') {
      mainText = item.hi;
      secondaryText = item.en;
    } else if (lang === 'or') {
      mainText = item.or;
      secondaryText = item.en;
    }
  }

  const scriptLang = lang === 'hi' ? 'hi' : lang === 'or' ? 'or' : 'en';

  if (lang === 'en' || !secondaryText || mainText === secondaryText) {
    return <span lang="en" className={className}>{mainText}</span>;
  }

  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span lang={scriptLang} className={`font-semibold ${primaryClassName}`}>
        {mainText}
      </span>
      <span lang="en" className={`text-[12px] opacity-80 font-normal leading-none mt-0.5 ${subClassName}`}>
        {secondaryText}
      </span>
    </span>
  );
};

/**
 * Format numbers in Indian numbering system (e.g., 1,23,456)
 */
export function formatIndianNumber(num: number | string | undefined | null): string {
  if (num === undefined || num === null) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return String(num);
  return n.toLocaleString('en-IN');
}

/**
 * Format dates in Indian style: "30 Sep 2026"
 */
export function formatIndianDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '30 Sep 2026';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '30 Sep 2026';
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format time in Indian 12-hour format: "10:42 AM"
 */
export function formatIndianTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '10:42 AM';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '10:42 AM';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Format days of stock remaining in words instead of abbreviations:
 * E.g., "3 दिन बचे / 3 days left" (never "3d")
 */
export function formatDaysRemaining(
  days: number,
  lang: AppLanguage
): { primary: string; enSub: string } {
  const rounded = Math.round(days);
  if (rounded <= 0) {
    if (lang === 'hi') return { primary: 'स्टॉक खत्म', enSub: 'Out of stock' };
    if (lang === 'or') return { primary: 'ଷ୍ଟକ୍ ସରିଗଲା', enSub: 'Out of stock' };
    return { primary: 'Out of stock', enSub: '0 days left' };
  }

  if (lang === 'hi') {
    return {
      primary: `${formatIndianNumber(rounded)} दिन बचे`,
      enSub: `${formatIndianNumber(rounded)} ${rounded === 1 ? 'day' : 'days'} left`,
    };
  }
  if (lang === 'or') {
    return {
      primary: `${formatIndianNumber(rounded)} ଦିନ ବାକି`,
      enSub: `${formatIndianNumber(rounded)} ${rounded === 1 ? 'day' : 'days'} left`,
    };
  }
  return {
    primary: `${formatIndianNumber(rounded)} ${rounded === 1 ? 'day' : 'days'} left`,
    enSub: `${formatIndianNumber(rounded)} days buffer remaining`,
  };
}

/**
 * Speech synthesis helper for accessibility.
 * Reads text aloud in Hindi (hi-IN), Odia (or-IN/hi-IN), or Indian English (en-IN).
 */
let globalUtterance: SpeechSynthesisUtterance | null = null;
let activeSpeakerCallback: (() => void) | null = null;

export function speakText(
  text: string,
  lang: AppLanguage,
  onStart?: () => void,
  onEnd?: () => void
): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return () => {};
  }

  // Cancel prior speech
  try {
    window.speechSynthesis.cancel();
    if (activeSpeakerCallback) {
      activeSpeakerCallback();
      activeSpeakerCallback = null;
    }
  } catch (e) {
    // Ignore cancel errors
  }

  const clean = text
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return () => {};

  const utterance = new SpeechSynthesisUtterance(clean);
  globalUtterance = utterance;

  if (lang === 'hi') {
    utterance.lang = 'hi-IN';
  } else if (lang === 'or') {
    utterance.lang = 'or-IN';
  } else {
    utterance.lang = 'en-IN';
  }

  utterance.rate = 0.92;
  utterance.pitch = 1.0;

  activeSpeakerCallback = () => {
    if (onEnd) onEnd();
  };

  utterance.onstart = () => {
    if (onStart) onStart();
  };
  utterance.onend = () => {
    globalUtterance = null;
    if (activeSpeakerCallback) {
      activeSpeakerCallback();
      activeSpeakerCallback = null;
    }
  };
  utterance.onerror = () => {
    globalUtterance = null;
    if (activeSpeakerCallback) {
      activeSpeakerCallback();
      activeSpeakerCallback = null;
    }
  };

  // Try selecting matching voice if available in browser
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    if (lang === 'hi') {
      const match = voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
      if (match) utterance.voice = match;
    } else if (lang === 'or') {
      const match = voices.find((v) => v.lang.toLowerCase().startsWith('or') || v.lang.toLowerCase().startsWith('hi'));
      if (match) utterance.voice = match;
    } else {
      const match = voices.find((v) => v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().startsWith('en'));
      if (match) utterance.voice = match;
    }
  }

  window.speechSynthesis.speak(utterance);

  return () => {
    try {
      window.speechSynthesis.cancel();
      globalUtterance = null;
      if (activeSpeakerCallback) {
        activeSpeakerCallback();
        activeSpeakerCallback = null;
      }
    } catch (e) {}
  };
}

/**
 * Accessible "सुनें / Listen" button for card text-to-speech reading.
 */
export const ListenButton: React.FC<{
  textToRead: string;
  lang: AppLanguage;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}> = ({ textToRead, lang, label, className = '', size = 'md' }) => {
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const cancelRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
      }
    };
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSpeaking) {
      if (cancelRef.current) cancelRef.current();
      setIsSpeaking(false);
      return;
    }

    const cancel = speakText(
      textToRead,
      lang,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
    cancelRef.current = cancel;
  };

  const isSmall = size === 'sm';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isSpeaking ? 'बोलना बंद करें / Stop reading' : 'कार्ड सुनें / Listen to this card'}
      className={`inline-flex items-center gap-1.5 rounded-[6px] border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#163D6E] ${
        isSpeaking
          ? 'bg-[#FEF3F2] border-[#F04438] text-[#B42318] font-semibold'
          : 'bg-white hover:bg-[#F5F7FA] border-[#D0D5DD] text-[#163D6E]'
      } ${isSmall ? 'px-2 py-1 text-xs min-h-[36px]' : 'px-2.5 py-1.5 text-xs sm:text-sm min-h-[44px]'} ${className}`}
    >
      {isSpeaking ? (
        <>
          <span className="flex items-center gap-0.5" aria-hidden="true">
            <span className="w-1 h-3 bg-[#B42318] animate-pulse" />
            <span className="w-1 h-4 bg-[#B42318] animate-pulse delay-75" />
            <span className="w-1 h-2 bg-[#B42318] animate-pulse delay-150" />
          </span>
          <span className="font-semibold">{lang === 'hi' ? 'रुकें' : lang === 'or' ? 'ଅଟକନ୍ତୁ' : 'Stop'}</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="font-semibold">{label || (lang === 'hi' ? 'सुनें' : lang === 'or' ? 'ଶୁଣନ୍ତୁ' : 'Listen')}</span>
        </>
      )}
    </button>
  );
};

/**
 * Medicine form line pictograms (tablet strip, sachet, IV bottle, test kit)
 */
export const MedicinePictogram: React.FC<{
  form?: string;
  className?: string;
}> = ({ form = '', className = 'w-5 h-5 shrink-0' }) => {
  const norm = form.toLowerCase();

  // 1. Tablet Strip (blister strip with pill dots)
  if (norm.includes('tablet') || norm.includes('strip') || norm.includes('capsule')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        {/* Strip boundary */}
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" fill="#F8FAFC" />
        {/* Blister perforations / pockets */}
        <ellipse cx="7.5" cy="8.5" rx="2" ry="2" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="12" cy="8.5" rx="2" ry="2" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="16.5" cy="8.5" rx="2" ry="2" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="7.5" cy="15.5" rx="2" ry="2" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="12" cy="15.5" rx="2" ry="2" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="16.5" cy="15.5" rx="2" ry="2" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    );
  }

  // 2. Sachet (packet with corner tear notch and zigzag crimp lines)
  if (norm.includes('sachet') || norm.includes('powder') || norm.includes('ors') || norm.includes('pack')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        {/* Pouch rectangle with top right tear notch */}
        <path
          d="M5 4a1 1 0 011-1h10l3 3v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a1 1 0 011-1z"
          stroke="currentColor"
          fill="#F8FAFC"
        />
        {/* Tear notch corner line */}
        <path d="M16 3v3h3" stroke="currentColor" strokeLinecap="round" />
        {/* Sachet sealed lines / packet logo */}
        <path d="M8 10h8M8 13h5M8 16h8" stroke="currentColor" strokeLinecap="round" strokeDasharray="1 2" />
      </svg>
    );
  }

  // 3. IV Bottle (hanging IV infusion fluid bottle with drip tube)
  if (norm.includes('iv') || norm.includes('fluid') || norm.includes('bottle') || norm.includes('ringer')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        {/* Hanging hook */}
        <path d="M12 2v2M9.5 2h5" stroke="currentColor" strokeLinecap="round" />
        {/* Bottle body */}
        <path
          d="M8 6h8a2 2 0 012 2v9a3 3 0 01-3 3H9a3 3 0 01-3-3V8a2 2 0 012-2z"
          stroke="currentColor"
          fill="#F8FAFC"
        />
        {/* Graduated volume markers */}
        <path d="M15 9h2M14 12h3M15 15h2" stroke="currentColor" strokeLinecap="round" />
        {/* Fluid level */}
        <path d="M8 13c2-1 6 1 8 0" stroke="currentColor" strokeLinecap="round" strokeDasharray="1 1" />
        {/* Stopper & drip tip */}
        <path d="M11 20v2M13 20v2" stroke="currentColor" strokeLinecap="round" />
      </svg>
    );
  }

  // 4. Test Kit (rapid diagnostic cassette with sample well 'S' & result window 'C | T')
  if (norm.includes('kit') || norm.includes('test') || norm.includes('rapid') || norm.includes('dengue')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        {/* Cassette body */}
        <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" fill="#F8FAFC" />
        {/* Round sample well 'S' */}
        <circle cx="7" cy="12" r="2.2" stroke="currentColor" strokeWidth={1.5} />
        {/* Result window with C / T line indicators */}
        <rect x="12" y="9.5" width="6.5" height="5" rx="1" stroke="currentColor" strokeWidth={1.2} />
        <path d="M14 10.5v3M16.5 10.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth={1.2} />
      </svg>
    );
  }

  // Generic medication fallback
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeLinecap="round" strokeWidth={2} />
    </svg>
  );
};

