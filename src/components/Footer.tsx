import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  HeartHandshake,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BilingualText } from '../lib/i18n';

export const Footer: React.FC = () => {
  const { language } = useApp();
  const [showPrinciples, setShowPrinciples] = useState(false);

  const principles = [
    {
      title: 'Under 20 seconds',
      subtitle: 'बीस सेकंड से कम में रिपोर्टिंग',
      icon: <Clock className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />,
      desc: 'PHC staff submit daily inventory in under 20 seconds via voice notes or register photos. No tedious manual data entry or administrative fatigue.',
    },
    {
      title: 'No new forms',
      subtitle: 'कोई नया फॉर्म नहीं',
      icon: <FileText className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />,
      desc: 'Staff speak in natural Hindi or Odia, or snap existing paper tally sheets. Dhara extracts structured data without introducing rigid software forms.',
    },
    {
      title: 'Data comes back',
      subtitle: 'डेटा का तुरंत लाभ',
      icon: <HeartHandshake className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />,
      desc: 'Staff always get something back for the data they give — automated re-supply shipments, district acknowledgments, and stockout early warnings.',
    },
    {
      title: 'A person confirms',
      subtitle: 'मानव द्वारा सत्यापन',
      icon: <CheckCircle2 className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />,
      desc: 'AI parses and drafts; humans verify. The pharmacist reviews the parsed card, adjusts any ambiguous line, and explicitly confirms before saving.',
    },
    {
      title: 'Coverage, not surveillance',
      subtitle: 'कवरेज, निगरानी नहीं',
      icon: <Users className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />,
      desc: 'District officers see only clinical duty coverage % and Medical Officer presence. Absent staff are never ranked or named to prevent workplace surveillance.',
    },
    {
      title: 'Never send a patient to an empty pharmacy',
      subtitle: 'मरीज़ का समय व विश्वास बचाना',
      icon: <ShieldCheck className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />,
      desc: 'Citizen queries check live ground-truth stock before advising travel. If stock is zero, patients are routed directly to the nearest confirmed alternative.',
    },
  ];

  return (
    <footer className="border-t border-[#D0D5DD] bg-white py-6 text-sm text-[#344054] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
        {/* Exact required footer text */}
        <div className="flex flex-wrap items-center gap-2">
          <span>Prototype v1.0</span>
          <span>·</span>
          <span>
            <BilingualText primary="कोई मरीज़ डेटा संग्रहीत नहीं" enSub="No patient data collected" lang={language} />
          </span>
          <span>·</span>
          <button
            type="button"
            onClick={() => setShowPrinciples(true)}
            className="text-[#163D6E] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#163D6E] rounded px-1 min-h-[48px]"
          >
            <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              <BilingualText primary="डिज़ाइन सिद्धांत" enSub="Design principles" lang={language} />
            </span>
          </button>
        </div>
      </div>

      {/* Design Principles Modal Dialog */}
      {showPrinciples && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="principles-modal-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-[8px] max-w-2xl w-full p-6 border border-[#D0D5DD] space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-3">
              <div>
                <h2 id="principles-modal-title" className="font-semibold text-lg text-[#101828]">
                  <BilingualText primary="मुख्य डिज़ाइन सिद्धांत" enSub="Core design principles" lang={language} />
                </h2>
                <p className="text-sm text-[#475467] mt-0.5">
                  <BilingualText primary="स्वास्थ्य प्रणाली के 6 अनिवार्य मानवीय नियम" enSub="Six non-negotiable human-in-the-loop healthcare design rules" lang={language} />
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrinciples(false)}
                aria-label="Close design principles dialog"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-[8px] border border-[#D0D5DD] text-[#344054] hover:bg-[#F5F7FA] cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {principles.map((p, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-[8px] border border-[#D0D5DD] bg-[#F5F7FA] space-y-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-[8px] bg-white border border-[#D0D5DD]">
                      {p.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-[#101828]">
                        <BilingualText primary={p.subtitle} enSub={p.title} lang={language} />
                      </h3>
                    </div>
                  </div>
                  <p className="text-sm text-[#344054] leading-normal">
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-[#D0D5DD]">
              <span className="text-sm text-[#475467]">
                <BilingualText primary="स्वास्थ्य कर्मियों की सुरक्षा हेतु निर्मित, उन पर बोझ नहीं।" enSub="Designed to protect frontline health workers, not burden them." lang={language} />
              </span>
              <button
                type="button"
                onClick={() => setShowPrinciples(false)}
                className="min-h-[48px] px-5 py-2.5 bg-[#163D6E] hover:bg-[#0F2B4E] text-white rounded-[8px] text-sm font-semibold cursor-pointer transition-colors"
              >
                <BilingualText primary="बंद करें" enSub="Close" lang={language} />
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
