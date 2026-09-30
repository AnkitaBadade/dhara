import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Contrast,
  Menu,
  RefreshCw,
  Stethoscope,
  Type,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BilingualText, t } from '../lib/i18n';
import { AppLanguage, StateCode, TextSize, UserRole } from '../types';

export const TopBar: React.FC = () => {
  const {
    selectedRole,
    setRole,
    selectedState,
    setStateCode,
    language,
    setLanguage,
    textSize,
    setTextSize,
    highContrast,
    setHighContrast,
    activeEmergencies,
    activeEmergency,
    emergencyTitle,
    clearEmergency,
    resetDemo,
  } = useApp();

  // Mobile drawer and popover states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAaOpen, setMobileAaOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);

  const otherStateCode: StateCode = selectedState === 'HR' ? 'OD' : 'HR';
  const otherStateName = otherStateCode === 'HR' ? 'Haryana' : 'Odisha';
  const currentEmergency =
    activeEmergency || (activeEmergencies ? activeEmergencies[selectedState]?.extraction : null);
  const currentTitle =
    emergencyTitle || (activeEmergencies ? activeEmergencies[selectedState]?.title : null);
  const otherStateEmergency = activeEmergencies ? activeEmergencies[otherStateCode] : null;

  const roles: Array<{ id: UserRole; key: string; icon: React.ReactNode }> = [
    {
      id: 'phc_staff',
      key: 'roleStaff',
      icon: <Stethoscope className="w-5 h-5 shrink-0" aria-hidden="true" />,
    },
    {
      id: 'district_officer',
      key: 'roleDistrict',
      icon: <Building2 className="w-5 h-5 shrink-0" aria-hidden="true" />,
    },
    {
      id: 'state_hub',
      key: 'roleState',
      icon: <Activity className="w-5 h-5 shrink-0" aria-hidden="true" />,
    },
    {
      id: 'citizen',
      key: 'roleCitizen',
      icon: <Users className="w-5 h-5 shrink-0" aria-hidden="true" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#D0D5DD]">
      {/* ========================================================================= */}
      {/* MOBILE TOP BAR (Under 640px): Collapses to exactly one 56px row           */}
      {/* "Dhara · धारा", language button, "Aa" button, and menu for role & state   */}
      {/* ========================================================================= */}
      <div className="sm:hidden h-14 min-h-[56px] px-3 flex items-center justify-between bg-white border-b border-[#D0D5DD]">
        {/* Brand */}
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-base text-[#101828] tracking-tight">
            Dhara · धारा
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#F5F7FA] border border-[#D0D5DD] text-[#475467] font-semibold">
            {selectedState}
          </span>
        </div>

        {/* Mobile quick actions: Language, Aa (Text & Contrast), Menu */}
        <div className="flex items-center gap-1.5">
          {/* 1. Language Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMobileLangOpen(!mobileLangOpen);
                setMobileAaOpen(false);
              }}
              aria-expanded={mobileLangOpen}
              aria-label="Change language / भाषा बदलें"
              className="h-10 min-h-[40px] px-2.5 rounded-[8px] border border-[#D0D5DD] bg-white text-[#101828] text-xs font-semibold flex items-center gap-1 hover:bg-[#F5F7FA] cursor-pointer"
            >
              <span>{language === 'hi' ? 'हिंदी' : language === 'or' ? 'ଓଡ଼ିଆ' : 'English'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#475467]" aria-hidden="true" />
            </button>

            {mobileLangOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 w-36 bg-white border border-[#D0D5DD] rounded-[8px] shadow-sm py-1 z-50 animate-in fade-in duration-150"
              >
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('en');
                    setMobileLangOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between ${
                    language === 'en' ? 'bg-[#F5F7FA] font-semibold text-[#163D6E]' : 'text-[#101828]'
                  }`}
                >
                  <span>English</span>
                  {language === 'en' && <Check className="w-4 h-4 text-[#163D6E]" />}
                </button>
                <button
                  type="button"
                  lang="hi"
                  onClick={() => {
                    setLanguage('hi');
                    setMobileLangOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between ${
                    language === 'hi' ? 'bg-[#F5F7FA] font-semibold text-[#163D6E]' : 'text-[#101828]'
                  }`}
                >
                  <span>हिंदी (Hindi)</span>
                  {language === 'hi' && <Check className="w-4 h-4 text-[#163D6E]" />}
                </button>
                <button
                  type="button"
                  lang="or"
                  onClick={() => {
                    setLanguage('or');
                    setMobileLangOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between ${
                    language === 'or' ? 'bg-[#F5F7FA] font-semibold text-[#163D6E]' : 'text-[#101828]'
                  }`}
                >
                  <span>ଓଡ଼ିଆ (Odia)</span>
                  {language === 'or' && <Check className="w-4 h-4 text-[#163D6E]" />}
                </button>
              </div>
            )}
          </div>

          {/* 2. Aa Button (Text Size & Contrast) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMobileAaOpen(!mobileAaOpen);
                setMobileLangOpen(false);
              }}
              aria-expanded={mobileAaOpen}
              aria-label="Text size and high contrast / अक्षर आकार और कंट्रास्ट"
              className="h-10 min-h-[40px] px-2.5 rounded-[8px] border border-[#D0D5DD] bg-white text-[#101828] text-xs font-semibold flex items-center gap-1 hover:bg-[#F5F7FA] cursor-pointer"
            >
              <Type className="w-4 h-4 text-[#163D6E]" aria-hidden="true" />
              <span>Aa</span>
            </button>

            {mobileAaOpen && (
              <div
                role="region"
                aria-label="Mobile accessibility controls"
                className="absolute right-0 top-12 w-64 bg-white border border-[#D0D5DD] rounded-[8px] p-3 shadow-sm z-50 space-y-3 animate-in fade-in duration-150"
              >
                <div>
                  <span className="text-xs font-semibold text-[#344054] block mb-1.5">
                    {language === 'hi' ? 'अक्षर आकार (Text size)' : language === 'or' ? 'ଅକ୍ଷର ଆକାର (Text size)' : 'Text size'}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5" role="group">
                    <button
                      type="button"
                      onClick={() => setTextSize('90')}
                      aria-pressed={textSize === '90'}
                      className={`min-h-[44px] py-1.5 rounded-[6px] border text-xs font-semibold ${
                        textSize === '90'
                          ? 'bg-[#163D6E] text-white border-[#163D6E]'
                          : 'bg-white text-[#101828] border-[#D0D5DD]'
                      }`}
                    >
                      A− (90%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextSize('100')}
                      aria-pressed={textSize === '100'}
                      className={`min-h-[44px] py-1.5 rounded-[6px] border text-xs font-semibold ${
                        textSize === '100'
                          ? 'bg-[#163D6E] text-white border-[#163D6E]'
                          : 'bg-white text-[#101828] border-[#D0D5DD]'
                      }`}
                    >
                      A (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextSize('125')}
                      aria-pressed={textSize === '125'}
                      className={`min-h-[44px] py-1.5 rounded-[6px] border text-xs font-semibold ${
                        textSize === '125'
                          ? 'bg-[#163D6E] text-white border-[#163D6E]'
                          : 'bg-white text-[#101828] border-[#D0D5DD]'
                      }`}
                    >
                      A+ (125%)
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#D0D5DD]">
                  <button
                    type="button"
                    onClick={() => setHighContrast((prev) => !prev)}
                    aria-pressed={highContrast}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-[6px] border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                      highContrast
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-[#101828] border-[#D0D5DD]'
                    }`}
                  >
                    <Contrast className="w-4 h-4" aria-hidden="true" />
                    <span>{highContrast ? 'Standard contrast' : 'High contrast'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Menu Button (Roles & State Switch) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-expanded={mobileMenuOpen}
            aria-label="Open role and state menu / मेनू खोलें"
            className="h-10 min-h-[40px] px-2.5 rounded-[8px] bg-[#163D6E] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Menu className="w-4 h-4" aria-hidden="true" />
            <span className="capitalize">{selectedRole.replace('_', ' ')}</span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer (Menu for Role, State, and Demo Reset) */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-black/50 flex justify-end animate-in fade-in duration-150">
          <div className="w-[85%] max-w-sm h-full bg-white p-5 flex flex-col justify-between overflow-y-auto border-l border-[#D0D5DD]">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#D0D5DD]">
                <div>
                  <h2 className="text-lg font-semibold text-[#101828]">Dhara · धारा</h2>
                  <p className="text-xs text-[#475467]">PHC resource management</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-[8px] border border-[#D0D5DD] text-[#101828]"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              {/* State Selection */}
              <div>
                <span className="text-sm font-semibold text-[#344054] block mb-2">
                  <BilingualText k="stateHaryana" primary="राज्य चुनें" enSub="Select State" lang={language} />
                </span>
                <div className="grid grid-cols-2 gap-2" role="group">
                  <button
                    type="button"
                    onClick={() => {
                      setStateCode('HR');
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[48px] px-3 rounded-[8px] border text-sm font-semibold cursor-pointer ${
                      selectedState === 'HR'
                        ? 'bg-[#163D6E] text-white border-[#163D6E]'
                        : 'bg-white text-[#101828] border-[#D0D5DD]'
                    }`}
                  >
                    Haryana
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStateCode('OD');
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[48px] px-3 rounded-[8px] border text-sm font-semibold cursor-pointer ${
                      selectedState === 'OD'
                        ? 'bg-[#163D6E] text-white border-[#163D6E]'
                        : 'bg-white text-[#101828] border-[#D0D5DD]'
                    }`}
                  >
                    Odisha
                  </button>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <span className="text-sm font-semibold text-[#344054] block mb-2">
                  <BilingualText primary="उपयोगकर्ता भूमिका" enSub="Switch Role View" lang={language} />
                </span>
                <div className="space-y-2">
                  {roles.map((r) => {
                    const isActive = selectedRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRole(r.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full min-h-[48px] p-3 rounded-[8px] border text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#163D6E] text-white border-[#163D6E]'
                            : 'bg-white text-[#101828] border-[#D0D5DD]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {r.icon}
                          <BilingualText k={r.key} lang={language} />
                        </div>
                        {isActive && <Check className="w-5 h-5 text-white" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Demo Reset */}
              <div className="pt-2 border-t border-[#D0D5DD]">
                <button
                  type="button"
                  onClick={() => {
                    resetDemo();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full min-h-[48px] px-3 py-2 rounded-[8px] border border-[#D0D5DD] bg-white text-[#344054] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-[#F5F7FA]"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  <span>Reset demo data</span>
                </button>
              </div>
            </div>

            <p className="text-[12px] text-[#475467] pt-4 border-t border-[#D0D5DD]">
              Prototype v1.0 · Synthetic data · Not an official service
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DESKTOP / TABLET HEADER (640px+): Accessibility bar + Main bar + Role nav */}
      {/* ========================================================================= */}
      <div className="hidden sm:block">
        {/* 1. Accessibility Bar (WCAG 2.1 AA / GIGW 3.0 / UX4G) */}
        <div
          className="bg-[#F5F7FA] border-b border-[#D0D5DD] px-4 py-1 text-sm text-[#344054]"
          aria-label="Accessibility tools"
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Skip link */}
            <div className="flex items-center gap-4">
              <a
                href="#main-content"
                className="inline-flex items-center min-h-[48px] px-3 py-2 font-semibold text-[#163D6E] underline hover:text-[#0F2B4E] focus:bg-[#163D6E] focus:text-white rounded-[8px]"
              >
                <BilingualText k="skipToContent" lang={language} />
              </a>
            </div>

            {/* Controls: Text size, Contrast, Language */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Text size controls: A- (90%), A (100%), A+ (125%) */}
              <div className="flex items-center gap-1" role="group" aria-label="Text size adjustments">
                <span className="text-xs text-[#475467] mr-1 hidden lg:inline">
                  <BilingualText k="textSize" lang={language} />:
                </span>
                <button
                  type="button"
                  onClick={() => setTextSize('90')}
                  aria-pressed={textSize === '90'}
                  aria-label="Small text size (90%)"
                  className={`min-h-[48px] min-w-[48px] px-2.5 py-1.5 rounded-[8px] border text-sm font-semibold transition-colors cursor-pointer ${
                    textSize === '90'
                      ? 'bg-[#163D6E] text-white border-[#163D6E]'
                      : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                  }`}
                >
                  A−
                </button>
                <button
                  type="button"
                  onClick={() => setTextSize('100')}
                  aria-pressed={textSize === '100'}
                  aria-label="Default standard text size (100%)"
                  className={`min-h-[48px] min-w-[48px] px-2.5 py-1.5 rounded-[8px] border text-base font-semibold transition-colors cursor-pointer ${
                    textSize === '100'
                      ? 'bg-[#163D6E] text-white border-[#163D6E]'
                      : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                  }`}
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={() => setTextSize('125')}
                  aria-pressed={textSize === '125'}
                  aria-label="Large text size (125%)"
                  className={`min-h-[48px] min-w-[48px] px-2.5 py-1.5 rounded-[8px] border text-lg font-semibold transition-colors cursor-pointer ${
                    textSize === '125'
                      ? 'bg-[#163D6E] text-white border-[#163D6E]'
                      : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                  }`}
                >
                  A+
                </button>
              </div>

              {/* High contrast toggle */}
              <button
                type="button"
                onClick={() => setHighContrast((prev) => !prev)}
                aria-pressed={highContrast}
                aria-label="Toggle high contrast view"
                className={`min-h-[48px] px-3 py-1.5 rounded-[8px] border text-sm font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  highContrast
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                }`}
              >
                <Contrast className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{highContrast ? t('normalContrast', language).primary : t('highContrast', language).primary}</span>
              </button>

              {/* Language switch */}
              <div className="flex items-center gap-1" role="group" aria-label="Select language">
                <button
                  type="button"
                  lang="en"
                  onClick={() => setLanguage('en')}
                  aria-pressed={language === 'en'}
                  aria-label="English"
                  className={`min-h-[48px] px-3 py-1.5 rounded-[8px] border text-sm font-semibold cursor-pointer transition-colors ${
                    language === 'en'
                      ? 'bg-[#163D6E] text-white border-[#163D6E]'
                      : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  lang="hi"
                  onClick={() => setLanguage('hi')}
                  aria-pressed={language === 'hi'}
                  aria-label="हिंदी (Hindi)"
                  className={`min-h-[48px] px-3 py-1.5 rounded-[8px] border text-sm font-semibold cursor-pointer transition-colors ${
                    language === 'hi'
                      ? 'bg-[#163D6E] text-white border-[#163D6E]'
                      : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                  }`}
                >
                  हिंदी
                </button>
                <button
                  type="button"
                  lang="or"
                  onClick={() => setLanguage('or')}
                  aria-pressed={language === 'or'}
                  aria-label="ଓଡ଼ିଆ (Odia)"
                  className={`min-h-[48px] px-3 py-1.5 rounded-[8px] border text-sm font-semibold cursor-pointer transition-colors ${
                    language === 'or'
                      ? 'bg-[#163D6E] text-white border-[#163D6E]'
                      : 'bg-white text-[#101828] border-[#D0D5DD] hover:bg-gray-100'
                  }`}
                >
                  ଓଡ଼ିଆ
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Main Header Title & Controls */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#101828] flex items-center gap-2">
              <span>Dhara · धारा</span>
            </h1>
            <p className="text-sm text-[#475467] mt-0.5">
              <BilingualText k="appSubtitle" lang={language} />
            </p>
          </div>

          {/* State selection & Demo reset */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px]" role="group" aria-label="Select state">
              <button
                type="button"
                onClick={() => setStateCode('HR')}
                aria-pressed={selectedState === 'HR'}
                className={`min-h-[48px] px-4 py-2 rounded-[8px] text-sm font-semibold cursor-pointer transition-colors ${
                  selectedState === 'HR'
                    ? 'bg-[#163D6E] text-white'
                    : 'text-[#344054] hover:text-[#101828] hover:bg-white'
                }`}
              >
                <BilingualText k="stateHaryana" lang={language} />
                {activeEmergencies?.HR && (
                  <span className="ml-1.5 inline-block w-2.5 h-2.5 rounded-full bg-[#B42318]" title="Active alert in Haryana" aria-label="Active alert in Haryana" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setStateCode('OD')}
                aria-pressed={selectedState === 'OD'}
                className={`min-h-[48px] px-4 py-2 rounded-[8px] text-sm font-semibold cursor-pointer transition-colors ${
                  selectedState === 'OD'
                    ? 'bg-[#163D6E] text-white'
                    : 'text-[#344054] hover:text-[#101828] hover:bg-white'
                }`}
              >
                <BilingualText k="stateOdisha" lang={language} />
                {activeEmergencies?.OD && (
                  <span className="ml-1.5 inline-block w-2.5 h-2.5 rounded-full bg-[#B42318]" title="Active alert in Odisha" aria-label="Active alert in Odisha" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={resetDemo}
              aria-label="Reset prototype demo data to initial state"
              className="min-h-[48px] px-3.5 py-2 rounded-[8px] border border-[#D0D5DD] bg-white text-[#344054] hover:text-[#101828] hover:bg-[#F5F7FA] text-sm font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Reset demo</span>
            </button>
          </div>
        </div>

        {/* 3. Role Navigation Bar */}
        <nav className="bg-[#F5F7FA] border-t border-[#D0D5DD]" aria-label="Role views">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex overflow-x-auto no-scrollbar gap-2 py-1">
            {roles.map((r) => {
              const isActive = selectedRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-h-[48px] px-5 py-2.5 text-base font-semibold whitespace-nowrap rounded-[8px] transition-colors flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-[#163D6E] text-white'
                      : 'text-[#344054] hover:text-[#101828] hover:bg-white border border-transparent'
                  }`}
                >
                  {r.icon}
                  <BilingualText k={r.key} lang={language} />
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* 4. Active Emergency Alert Banner */}
      {currentEmergency ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
          <div
            role="alert"
            aria-live="polite"
            className="early-warning-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div className="flex items-start sm:items-center gap-3">
              <span className="p-2 rounded-[8px] bg-[#FEF3F2] text-[#B42318] shrink-0 border border-[#FDA29B]">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] text-sm font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    Critical
                  </span>
                  <span className="font-semibold text-base text-[#101828]">
                    Emergency mode active ({selectedState === 'HR' ? 'Haryana' : 'Odisha'}):
                  </span>
                </div>
                <p className="text-sm text-[#344054] mt-0.5">
                  {currentTitle || currentEmergency.disease_or_hazard} — Surge factors engaged for {currentEmergency.affected_districts.join(', ')}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => clearEmergency(selectedState)}
              aria-label="Dismiss active emergency alert"
              className="min-h-[48px] px-4 py-2 border border-[#D0D5DD] bg-white hover:bg-[#F5F7FA] text-[#344054] text-sm font-semibold rounded-[8px] shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : otherStateEmergency ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
          <div
            role="status"
            className="bg-white border border-[#D0D5DD] border-l-4 border-l-[#B54708] p-3 rounded-[8px] flex items-center justify-between gap-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] text-sm font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Warning
              </span>
              <span className="text-[#101828] font-medium">
                1 active health emergency reported in {otherStateName} ({otherStateEmergency.title || otherStateEmergency.extraction.disease_or_hazard}).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStateCode(otherStateCode)}
              className="min-h-[48px] px-3 text-[#163D6E] font-semibold underline hover:text-[#0F2B4E] cursor-pointer"
            >
              Switch to {otherStateName}
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
};
