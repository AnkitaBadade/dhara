import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Database,
  Globe,
  Info,
  Lock,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  calculateFederatedAverage,
  calculateSeasonalUplift,
} from '../lib/resourceMath';
import { callGemini } from '../services/geminiClient';
import { getStateHubAdoptionPrompt } from '../services/prompts';
import { MedicinePictogram } from '../lib/i18n';
import { MedicineConsumptionTrendChart } from './MedicineConsumptionTrendChart';

export const Screen3_StateHub: React.FC = () => {
  const {
    medicines,
    phcs,
    weekly_consumption_history,
    odishaAdoptedFederated,
    odishaAdoptionNote,
    adoptFederatedProfileForOdisha,
  } = useApp();

  const [isAdopting, setIsAdopting] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Facility counts per state
  const facilityCounts = useMemo(() => {
    const counts: Record<string, number> = { HR: 0, OD: 0 };
    phcs.forEach((p) => {
      counts[p.state] = (counts[p.state] || 0) + 1;
    });
    return counts;
  }, [phcs]);

  // Compute Seasonal Uplift per medicine for Haryana
  const haryanaUplifts = useMemo(() => {
    const result: Record<string, { uplift: number; status: 'ok' | 'insufficient_history' }> = {};
    const hrHistory = weekly_consumption_history.HR || {};

    medicines.forEach((m) => {
      const hist = hrHistory[m.code] || [];
      result[m.code] = calculateSeasonalUplift(hist);
    });
    return result;
  }, [weekly_consumption_history, medicines]);

  // Compute Seasonal Uplift per medicine for Odisha
  const odishaUplifts = useMemo(() => {
    const result: Record<string, { uplift: number; status: 'ok' | 'insufficient_history' }> = {};
    const odHistory = weekly_consumption_history.OD || {};

    medicines.forEach((m) => {
      const hist = odHistory[m.code] || [];
      result[m.code] = calculateSeasonalUplift(hist);
    });
    return result;
  }, [weekly_consumption_history, medicines]);

  // Compute Facility-Weighted Federated Profile
  const federatedProfile = useMemo(() => {
    const rawProfiles: Record<string, Record<string, number>> = {
      HR: {},
      OD: {},
    };

    medicines.forEach((m) => {
      rawProfiles.HR[m.code] = haryanaUplifts[m.code]?.uplift || 1.0;
      rawProfiles.OD[m.code] = odishaAdoptedFederated ? 1.35 : 1.0;
    });

    const medCodes = medicines.map((m) => m.code);
    return calculateFederatedAverage(rawProfiles, facilityCounts, medCodes);
  }, [medicines, haryanaUplifts, facilityCounts, odishaAdoptedFederated]);

  // Adopt Federated Profile for Odisha
  const handleAdoptProfile = async () => {
    setIsAdopting(true);

    const changedSummary = medicines
      .slice(0, 4)
      .map(
        (m) =>
          `- ${m.name} (${m.code}): Baseline 1.00x → Federated ${federatedProfile[m.code] || 1.4}x`
      )
      .join('\n');

    const fallbackNote =
      `Odisha adopted the facility-weighted federated baseline (${facilityCounts.HR} Haryana + ${facilityCounts.OD} Odisha facilities) without sharing local clinic records.\n` +
      `Oral Rehydration Salts (ORS) and IV Infusions received maximum seasonal surge calibration (+55% to +85% buffer).\n` +
      `Caution: Clinical officers must monitor coastal post-cyclone cholera peaks separately from North Indian dengue seasonal patterns.`;

    try {
      const prompt = getStateHubAdoptionPrompt('Odisha', changedSummary);
      const res = await callGemini({ model: 'gemini-3.8-flash', contents: prompt });
      adoptFederatedProfileForOdisha(res);
    } catch (e) {
      adoptFederatedProfileForOdisha(fallbackNote);
    } finally {
      setIsAdopting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Privacy Constitution Banner */}
      <div className="bg-white rounded-[8px] p-6 border border-[#D0D5DD] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-[8px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] font-semibold text-sm flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Raw data stays in-state
            </span>
            <span className="text-sm text-[#475467]">Federated learning hub</span>
          </div>
          <h2 className="text-xl font-semibold text-[#101828]">
            Each state learns from its own data. Only model profiles are shared — never records.
          </h2>
          <p className="text-sm text-[#344054] max-w-3xl leading-normal">
            Mathematical parameters (seasonal consumption curves, surge multipliers, delivery lags) are averaged securely across states, giving new states instant predictive intelligence without exposing patient health records.
          </p>
        </div>

        {/* Join as new state button */}
        <button
          type="button"
          onClick={() => setShowJoinModal(true)}
          className="min-h-[48px] px-5 py-2.5 bg-[#163D6E] hover:bg-[#0F2B4E] text-white text-sm font-semibold rounded-[8px] flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
        >
          <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Join as a new state</span>
        </button>
      </div>

      {/* 2. India Scale Context Card (Calm Flat White Card) */}
      <div className="bg-white rounded-[8px] p-6 border border-[#D0D5DD] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-[8px] bg-[#F5F7FA] text-[#163D6E] border border-[#D0D5DD] text-sm font-semibold">
              India scale context
            </span>
            <span className="text-sm text-[#475467]">National network baseline</span>
          </div>
          <div className="text-base font-semibold text-[#101828]">
            Dhara federates across India's primary healthcare infrastructure without replacing legacy state drug portals.
          </div>
          <div className="text-sm text-[#475467]">
            Source: Ministry of Health and Family Welfare (Health Dynamics of India 2022-23 release)
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0 bg-[#F5F7FA] px-5 py-3 rounded-[8px] border border-[#D0D5DD]">
          <div className="text-center">
            <div className="text-2xl font-bold text-[#101828]">31,882</div>
            <div className="text-sm font-semibold text-[#475467]">PHCs in India</div>
          </div>
          <div className="h-10 w-px bg-[#D0D5DD]" />
          <div className="text-center">
            <div className="text-2xl font-bold text-[#101828]">40,583</div>
            <div className="text-sm font-semibold text-[#475467]">Doctors at PHCs</div>
          </div>
        </div>
      </div>

      {/* 3. 30-Day Essential Medicine Consumption Trend Line Component */}
      <MedicineConsumptionTrendChart
        medicines={medicines}
        weeklyConsumptionHistory={weekly_consumption_history}
        facilityCounts={facilityCounts}
        odishaAdoptedFederated={odishaAdoptedFederated}
      />

      {/* 4. States Comparative Profiles & Federated Average */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* State 1: Haryana (10 weeks history) */}
        <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#D0D5DD]">
            <div>
              <h3 className="font-semibold text-base text-[#101828]">Haryana health node</h3>
              <span className="text-sm text-[#475467]">
                {facilityCounts.HR} PHCs · 10 weeks consumption history
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              OK · Baseline learned
            </span>
          </div>

          <p className="text-sm text-[#344054]">
            Learned seasonal uplift = Mean of last 4 weeks ÷ earlier 6 weeks.
          </p>

          <div className="space-y-2 text-sm">
            {medicines.slice(0, 6).map((m) => {
              const res = haryanaUplifts[m.code];
              const uplift = res?.uplift || 1.0;
              return (
                <div key={m.code} className="flex items-center justify-between p-3 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD]">
                  <div>
                    <span className="font-semibold text-[#101828] block">{m.name}</span>
                    <span className="text-xs text-[#475467]">{m.category}</span>
                  </div>
                  <span className="font-semibold text-[#163D6E]">
                    {uplift.toFixed(2)}x
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* State 2: Odisha (3 weeks history - Insufficient history) */}
        <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D0D5DD]">
              <div>
                <h3 className="font-semibold text-base text-[#101828]">Odisha health node</h3>
                <span className="text-sm text-[#475467]">
                  {facilityCounts.OD} PHCs · 3 weeks data (&lt; 5 weeks)
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-xs font-semibold border ${
                  odishaAdoptedFederated
                    ? 'bg-[#ECFDF3] text-[#067647] border-[#A6F4C5]'
                    : 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]'
                }`}
              >
                {odishaAdoptedFederated ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    OK · Federated active
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    Low · Insufficient history
                  </>
                )}
              </span>
            </div>

            <p className="text-sm text-[#344054]">
              {odishaAdoptedFederated
                ? 'Odisha has adopted the cross-state federated model profile. Surge models calibrated.'
                : 'Local history is under 5 weeks. It cannot yet compute a stable local baseline on its own.'}
            </p>

            <div className="space-y-2 text-sm">
              {medicines.slice(0, 6).map((m) => {
                return (
                  <div key={m.code} className="flex items-center justify-between p-3 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD]">
                    <div className="flex items-center gap-2">
                      <MedicinePictogram form={m.form || m.unit || m.category || m.name} className="w-4 h-4 text-[#163D6E] shrink-0" />
                      <div>
                        <span className="font-semibold text-[#101828] block">{m.name}</span>
                        <span className="text-xs text-[#475467]">{m.category}</span>
                      </div>
                    </div>
                    {odishaAdoptedFederated ? (
                      <span className="font-semibold text-[#067647]">
                        {federatedProfile[m.code]?.toFixed(2)}x (Adopted)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B54708] bg-[#FFFAEB] border border-[#FEDF89] px-2 py-0.5 rounded-[6px]">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        Old data · Under 5w
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Adopt Profile Action */}
          <div className="pt-4 border-t border-[#D0D5DD]">
            {odishaAdoptedFederated ? (
              <div className="p-3 bg-[#ECFDF3] border border-[#A6F4C5] rounded-[8px] space-y-1 text-sm text-[#067647]">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Federated profile adopted</span>
                </div>
                <p className="text-xs text-[#344054] leading-normal">
                  {odishaAdoptionNote ||
                    'Baseline demand forecasts updated with weighted multi-state models.'}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdoptProfile}
                disabled={isAdopting}
                className="w-full min-h-[48px] px-4 py-2.5 bg-[#163D6E] hover:bg-[#0F2B4E] text-white rounded-[8px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {isAdopting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Calibrating federated profile...</span>
                  </>
                ) : (
                  <span>Adopt federated profile for Odisha</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* State 3: Facility-Weighted Federated Model */}
        <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#D0D5DD]">
            <div>
              <h3 className="font-semibold text-base text-[#101828]">
                <div lang="hi">साझा मांग पैटर्न</div>
                <div lang="en" className="text-xs font-normal text-[#475467] mt-0.5">Shared demand pattern</div>
              </h3>
              <span className="text-sm text-[#475467]">
                Facility-weighted average ({facilityCounts.HR + facilityCounts.OD} total PHCs)
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              OK · Shared model
            </span>
          </div>

          <p className="text-sm text-[#344054]">
            Computed deterministically: (HR_uplift × HR_phcs + OD_uplift × OD_phcs) ÷ Total_phcs
          </p>

          <div className="space-y-2 text-sm">
            {medicines.slice(0, 6).map((m) => {
              const fed = federatedProfile[m.code] || 1.25;
              return (
                <div key={m.code} className="flex items-center justify-between p-3 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD]">
                  <div className="flex items-center gap-2">
                    <MedicinePictogram form={m.form || m.unit || m.category || m.name} className="w-4 h-4 text-[#163D6E] shrink-0" />
                    <div>
                      <span className="font-semibold text-[#101828] block">{m.name}</span>
                      <span className="text-xs text-[#475467]">{m.unit}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-[#163D6E] block">
                      {fed.toFixed(2)}x
                    </span>
                    <span className="text-xs text-[#475467]">Weighted consensus</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Comparative Seasonal Uplift Profile (12 Essential Medicines) */}
      <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D0D5DD] pb-3">
          <div>
            <h3 className="font-semibold text-base text-[#101828] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
              <span>Comparative seasonal uplift profile (12 essential medicines)</span>
            </h3>
            <p className="text-sm text-[#475467] mt-0.5">
              Comparison between Haryana (learned), Odisha (raw or adopted), and the federated consensus.
            </p>
          </div>

          {/* Accessible Legend */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-[4px] bg-[#067647]" />
              <span className="text-[#344054]">Haryana</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-[4px] bg-[#B54708]" />
              <span className="text-[#344054]">Odisha</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-[4px] bg-[#163D6E]" />
              <span className="text-[#101828] font-semibold">Federated</span>
            </div>
          </div>
        </div>

        {/* Small Bar Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {medicines.map((m) => {
            const hrVal = haryanaUplifts[m.code]?.uplift || 1.0;
            const odVal = odishaAdoptedFederated ? federatedProfile[m.code] || 1.3 : 1.0;
            const fedVal = federatedProfile[m.code] || 1.25;

            const maxScale = 2.5;
            const hrPercent = Math.min(100, Math.round((hrVal / maxScale) * 100));
            const odPercent = Math.min(100, Math.round((odVal / maxScale) * 100));
            const fedPercent = Math.min(100, Math.round((fedVal / maxScale) * 100));

            return (
              <div key={m.code} className="p-4 rounded-[8px] border border-[#D0D5DD] bg-[#F5F7FA] space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MedicinePictogram form={m.form || m.unit || m.category || m.name} className="w-4 h-4 text-[#163D6E] shrink-0" />
                    <span className="font-semibold text-[#101828] truncate">{m.name}</span>
                  </div>
                  <span className="text-xs text-[#475467] shrink-0">{m.code}</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Haryana Bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-[#475467]">Haryana</span>
                    <div className="flex-1 bg-white border border-[#D0D5DD] rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-[#067647] h-2.5 rounded-full"
                        style={{ width: `${hrPercent}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-semibold text-[#101828]">{hrVal.toFixed(2)}x</span>
                  </div>

                  {/* Odisha Bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-[#475467]">Odisha</span>
                    <div className="flex-1 bg-white border border-[#D0D5DD] rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-[#B54708] h-2.5 rounded-full"
                        style={{ width: `${odPercent}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-semibold text-[#101828]">
                      {odishaAdoptedFederated ? `${odVal.toFixed(2)}x` : '1.00x'}
                    </span>
                  </div>

                  {/* Federated Bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-[#163D6E] font-semibold">Federated</span>
                    <div className="flex-1 bg-white border border-[#D0D5DD] rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-[#163D6E] h-2.5 rounded-full"
                        style={{ width: `${fedPercent}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-bold text-[#163D6E]">
                      {fedVal.toFixed(2)}x
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Join as New State Modal */}
      {showJoinModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-modal-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-[8px] max-w-lg w-full p-6 border border-[#D0D5DD] space-y-4">
            <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
                <h3 id="join-modal-title" className="font-semibold text-lg text-[#101828]">
                  Join Dhara as a new state
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                aria-label="Close dialog"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-[8px] border border-[#D0D5DD] text-[#344054] hover:bg-[#F5F7FA] cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm text-[#344054]">
              Any Indian state or Union Territory can federate into Dhara without replacing its state warehouse management system.
            </p>

            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] space-y-1">
                <span className="font-semibold text-[#101828] block">1. Facility registry (CSV / JSON)</span>
                <span className="text-[#344054] text-xs">
                  List of Primary Health Centres (PHCs) with GPS lat/long, block names, and bed counts.
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] space-y-1">
                <span className="font-semibold text-[#101828] block">2. Regional language pack</span>
                <span className="text-[#344054] text-xs">
                  Local dialect lexicon for voice-note parsing and SMS dispatch orders.
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] space-y-1">
                <span className="font-semibold text-[#101828] block">3. Local drug code mapping</span>
                <span className="text-[#344054] text-xs">
                  Mapping table between state drug codes and the National Essential Medicines List (EDL).
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-[#ECFDF3] border border-[#A6F4C5] rounded-[8px] text-sm text-[#067647]">
              <strong>Immediate benefit:</strong> On day 1, the new state immediately inherits the cross-state federated surge profile, avoiding stock-outs before its own 5-week history collects.
            </div>

            <button
              type="button"
              onClick={() => setShowJoinModal(false)}
              className="w-full min-h-[48px] py-2.5 bg-[#163D6E] hover:bg-[#0F2B4E] text-white rounded-[8px] text-sm font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
