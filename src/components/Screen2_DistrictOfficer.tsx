import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bed,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  MapPin,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Truck,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import L from 'leaflet';
import { useApp } from '../context/AppContext';
import { SAMPLE_BULLETINS } from '../data/phcData';
import { BilingualText, formatDaysAgo, t, MedicinePictogram } from '../lib/i18n';
import {
  calculateDaysOfStock,
  calculateSeasonalUplift,
  findRedistributionCandidates,
  haversineDistance,
} from '../lib/resourceMath';
import { callGemini, callGeminiJSON, GEMINI_MODEL } from '../services/geminiClient';
import {
  getEmergencyBulletinPrompt,
  getExplainShortagePrompt,
  getTransferOrderPrompt,
} from '../services/prompts';
import {
  EmergencySurgeExtraction,
  PHC,
  TransferOrder,
} from '../types';

const SHORT_MED_NAMES: Record<string, string> = {
  PCM500: 'Paracetamol',
  ORS: 'ORS',
  MET500: 'Metformin',
  AML5: 'Amlodipine',
  TEL40: 'Telmisartan',
  AMX500: 'Amoxicillin',
  IFA: 'IFA',
  ZN20: 'Zinc',
  CTZ10: 'Cetirizine',
  ATV10: 'Atorvastatin',
  RL500: 'RL IV',
  NS1KIT: 'Dengue kit',
};

export const Screen2_DistrictOfficer: React.FC = () => {
  const {
    selectedState,
    phcs,
    medicines,
    stock,
    beds,
    staff,
    rules,
    weekly_consumption_history,
    selectedDistrict,
    setSelectedDistrict,
    rawVsAdjusted,
    setRawVsAdjusted,
    activeEmergency,
    activateEmergency,
    clearEmergency,
    transfers,
    addTransfers,
    approveTransfer,
    undoTransfer,
    activityLogs,
    odishaAdoptedFederated,
    language,
  } = useApp();

  // Filter PHCs in selected state
  const statePhcs = useMemo(
    () => phcs.filter((p) => p.state === selectedState),
    [phcs, selectedState]
  );

  // Available districts in state
  const districts = useMemo(() => {
    const set = new Set(statePhcs.map((p) => p.district));
    return ['ALL', ...Array.from(set)];
  }, [statePhcs]);

  // Filtered PHCs
  const filteredPhcs = useMemo(() => {
    if (selectedDistrict === 'ALL') return statePhcs;
    return statePhcs.filter((p) => p.district === selectedDistrict);
  }, [statePhcs, selectedDistrict]);

  // Compute Seasonal Uplift per medicine for current state
  const upliftMap = useMemo(() => {
    const map: Record<string, number> = {};
    const stateHistory = weekly_consumption_history[selectedState] || {};

    medicines.forEach((med) => {
      const hist = stateHistory[med.code] || [];
      if (selectedState === 'OD' && !odishaAdoptedFederated) {
        // Odisha before adopting federated has insufficient history -> 1.0 baseline
        map[med.code] = 1.0;
      } else if (selectedState === 'OD' && odishaAdoptedFederated) {
        // Uses federated profile (facility weighted average from Haryana ~1.4)
        map[med.code] = 1.35;
      } else {
        const res = calculateSeasonalUplift(hist);
        map[med.code] = res.uplift;
      }
    });
    return map;
  }, [selectedState, weekly_consumption_history, medicines, odishaAdoptedFederated]);

  // Surge Multipliers from active emergency (if any)
  const surgeMap = useMemo(() => {
    if (!activeEmergency) return {};
    return activeEmergency.surge || {};
  }, [activeEmergency]);

  // Map state
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapLayer, setMapLayer] = useState<'stock' | 'beds' | 'staff'>('stock');
  const [mapViewMode, setMapViewMode] = useState<'map' | 'list'>('map');

  // Explain modal state
  const [explainItem, setExplainItem] = useState<{
    phcName: string;
    medName: string;
    days: number;
    stockQty: number;
    dailyBurn: number;
    reason: string;
    aiExplanation?: string;
    loading?: boolean;
  } | null>(null);

  // Emergency bulletin input state
  const [bulletinInput, setBulletinInput] = useState('');
  const [isParsingBulletin, setIsParsingBulletin] = useState(false);

  // Redistribution planning state
  const [isPlanningTransfers, setIsPlanningTransfers] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);

  // Situational Awareness Actions state & Exception-first grid state
  const [completedActionIds, setCompletedActionIds] = useState<string[]>([]);
  const [onlyProblems, setOnlyProblems] = useState<boolean>(true);
  const [expandedWhyTransfers, setExpandedWhyTransfers] = useState<Record<string, boolean>>({});

  // Helper for future day name (e.g. Friday)
  const getFutureDayName = (daysAhead: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, Math.round(daysAhead)));
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  };

  // Transfers sorted by recipient urgency (lowest days first), at most 8
  const sortedTransfers = useMemo(() => {
    return [...transfers]
      .sort((a, b) => {
        const aDays = a.recipient_current_days ?? 999;
        const bDays = b.recipient_current_days ?? 999;
        return aDays - bDays;
      })
      .slice(0, 8);
  }, [transfers]);

  // Calculate Days of Stock helper
  const getDays = (phcId: string, medCode: string) => {
    const item = stock[phcId]?.[medCode];
    if (!item) return 999;
    const uplift = rawVsAdjusted === 'adjusted' ? upliftMap[medCode] || 1.0 : 1.0;
    const surge = activeEmergency?.affected_districts.includes(
      phcs.find((p) => p.id === phcId)?.district || ''
    )
      ? surgeMap[medCode] || 1.0
      : 1.0;

    return calculateDaysOfStock(item.quantity, item.daily_burn_rate, uplift, surge);
  };

  const getPhcDaysAgo = (phcId: string): number => {
    const phcStock = stock[phcId] || {};
    const timestamps = [
      ...Object.values(phcStock).map((s) => s.last_updated),
      beds[phcId]?.last_updated,
    ].filter(Boolean) as string[];

    if (timestamps.length === 0) return 999;
    const maxTime = Math.max(...timestamps.map((t) => new Date(t).getTime()));
    return Math.floor((Date.now() - maxTime) / (1000 * 60 * 60 * 24));
  };

  // Determine worst status for a PHC: critical (<7d, red) > warning (<15d, amber) > ok (green)
  const getPhcStatus = (phc: PHC) => {
    let worst = 'ok'; // 'critical' | 'warning' | 'ok' | 'stale'
    for (const med of medicines) {
      const d = getDays(phc.id, med.code);
      if (d <= 0 || d < rules.critical_threshold_days) {
        return { status: 'critical', label: 'Critical', color: '#B42318' };
      }
      if (d < rules.warning_threshold_days) {
        worst = 'warning';
      }
    }

    if (worst === 'warning') {
      return { status: 'warning', label: 'Low', color: '#B54708' };
    }

    const daysAgo = getPhcDaysAgo(phc.id);
    if (daysAgo > 7) {
      return { status: 'stale', label: 'Old data', color: '#B54708' };
    }

    return { status: 'ok', label: 'OK', color: '#067647' };
  };

  // Top Problem helper for map markers and tooltips (Requirement 4)
  const getTopProblem = (phc: PHC) => {
    const bedInfo = beds[phc.id] || { total: 10, occupied: 5, available: 5 };
    const staffMembers = staff[phc.id] || [];
    const moPresent = staffMembers.find((s) => s.is_mo || s.role === 'Medical Officer')?.status === 'present';
    const daysAgo = getPhcDaysAgo(phc.id);

    // 1. Critical stockout check
    for (const med of medicines) {
      const d = getDays(phc.id, med.code);
      if (d <= 0 || d < rules.critical_threshold_days) {
        return {
          type: 'critical',
          color: '#B42318',
          label: 'Critical',
          problemText: `Critical stockout risk: ${med.name.split(' ')[0]} (${d <= 0 ? 0 : d}d buffer)`,
          iconHtml: `<div style="background-color: #B42318; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 13px; line-height: 1;">!</div>`,
        };
      }
    }

    // 2. Doctor absent
    if (!moPresent) {
      return {
        type: 'low',
        color: '#B54708',
        label: 'Staffing gap',
        problemText: 'Medical officer absent today (Nurse cover active)',
        iconHtml: `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;"><svg width="24" height="24" viewBox="0 0 24 22" fill="#B54708"><path d="M12 2L1 21h22L12 2z" stroke="white" stroke-width="2" stroke-linejoin="round"/><text x="12" y="18" fill="white" font-size="11" font-weight="bold" text-anchor="middle">▲</text></svg></div>`,
      };
    }

    // 3. Zero beds available
    if (bedInfo.available === 0) {
      return {
        type: 'low',
        color: '#B54708',
        label: 'Bed saturation',
        problemText: `No vacant beds (0 of ${bedInfo.total} available)`,
        iconHtml: `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;"><svg width="24" height="24" viewBox="0 0 24 22" fill="#B54708"><path d="M12 2L1 21h22L12 2z" stroke="white" stroke-width="2" stroke-linejoin="round"/><text x="12" y="18" fill="white" font-size="11" font-weight="bold" text-anchor="middle">▲</text></svg></div>`,
      };
    }

    // 4. Old data (> 7 days)
    if (daysAgo > 7) {
      return {
        type: 'stale',
        color: '#475467',
        label: 'Old data',
        problemText: `Old data: Last confirmed report ${formatDaysAgo(daysAgo, language).fullText}`,
        iconHtml: `<div style="background-color: #475467; width: 22px; height: 22px; border-radius: 3px; border: 2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">■</div>`,
      };
    }

    // 5. Low stock buffer (< 15 days)
    for (const med of medicines) {
      const d = getDays(phc.id, med.code);
      if (d < rules.warning_threshold_days) {
        return {
          type: 'low',
          color: '#B54708',
          label: 'Low buffer',
          problemText: `Low reserve: ${med.name.split(' ')[0]} (${d}d buffer)`,
          iconHtml: `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;"><svg width="24" height="24" viewBox="0 0 24 22" fill="#B54708"><path d="M12 2L1 21h22L12 2z" stroke="white" stroke-width="2" stroke-linejoin="round"/><text x="12" y="18" fill="white" font-size="11" font-weight="bold" text-anchor="middle">▲</text></svg></div>`,
        };
      }
    }

    // 6. Adequate
    return {
      type: 'ok',
      color: '#067647',
      label: 'OK',
      problemText: 'All medicine buffers, beds, and staff adequate',
      iconHtml: `<div style="background-color: #067647; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; line-height: 1;">✓</div>`,
    };
  };

  // Leaflet Map Initialization & Updates (Requirement 7: Load map ONLY when map view is opened)
  useEffect(() => {
    if (mapViewMode !== 'map' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] =
        selectedState === 'HR' ? [28.18, 77.25] : [20.2, 85.85];
      const initialZoom = selectedState === 'HR' ? 9 : 9;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    if (map) {
      const center: [number, number] =
        selectedState === 'HR' ? [28.18, 77.25] : [20.2, 85.85];
      map.setView(center, 9);

      // Clear existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
          map.removeLayer(layer);
        }
      });

      // Add PHC markers with distinct shapes & icons (Requirement 4)
      filteredPhcs.forEach((phc) => {
        const topProblem = getTopProblem(phc);
        const bedInfo = beds[phc.id] || { total: 10, occupied: 5, available: 5 };
        const staffMembers = staff[phc.id] || [];
        const moPresent = staffMembers.find((s) => s.is_mo || s.role === 'Medical Officer')?.status === 'present';

        const customIcon = L.divIcon({
          html: topProblem.iconHtml,
          className: 'custom-leaflet-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([phc.lat, phc.lng], { icon: customIcon }).addTo(map);

        // Tapping a marker shows PHC name and its top problem (Requirement 4)
        const popupContent = `
          <div style="font-family: 'Noto Sans', system-ui, sans-serif; font-size: 13px; min-width: 220px; padding: 4px; line-height: 1.4;">
            <strong style="font-size: 14px; color: #101828; display: block;">${phc.name}</strong>
            <div style="color: #475467; font-size: 12px; margin-bottom: 6px;">${phc.district} District • ${phc.block}</div>
            <div style="padding: 6px 8px; border-radius: 6px; background-color: #F5F7FA; border: 1px solid #D0D5DD; margin-bottom: 6px;">
              <strong style="font-size: 11px; color: #344054; display: block; text-transform: uppercase;">TOP PROBLEM / STATUS:</strong>
              <span style="color: ${topProblem.color}; font-weight: 600; font-size: 13px; display: block; margin-top: 2px;">${topProblem.problemText}</span>
            </div>
            <div style="font-size: 12px; color: #344054;">
              <div>• Vacant beds: <strong>${bedInfo.available}</strong> / ${bedInfo.total}</div>
              <div>• Medical officer: <strong>${moPresent ? 'Present' : 'Absent'}</strong></div>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
      });
    }
  }, [mapViewMode, filteredPhcs, selectedState, mapLayer, rawVsAdjusted, stock, beds, staff]);

  // Clean map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Compute KPI counts
  const kpiData = useMemo(() => {
    let freshPhcsCount = 0;
    let criticalMedsCount = 0;
    let totalFreeBeds = 0;
    let phcsWithoutMo = 0;

    filteredPhcs.forEach((p) => {
      const daysAgo = getPhcDaysAgo(p.id);
      if (daysAgo <= 7) freshPhcsCount++;

      medicines.forEach((m) => {
        const d = getDays(p.id, m.code);
        if (d <= 0 || d < rules.critical_threshold_days) {
          criticalMedsCount++;
        }
      });

      const b = beds[p.id];
      if (b) totalFreeBeds += b.available;

      const st = staff[p.id] || [];
      const hasMo = st.find((s) => s.is_mo)?.status === 'present';
      if (!hasMo) phcsWithoutMo++;
    });

    const pendingTransfers = transfers.filter((t) => t.status === 'pending' || t.status === 'auto_dispatched').length;

    return {
      freshPhcs: `${freshPhcsCount} / ${filteredPhcs.length}`,
      criticalMeds: criticalMedsCount,
      freeBeds: totalFreeBeds,
      noMoPhcs: phcsWithoutMo,
      pendingTransfers,
    };
  }, [filteredPhcs, stock, medicines, beds, staff, rules, transfers, rawVsAdjusted, upliftMap, surgeMap]);

  // Today's 3 actions based on clinical priorities (What's wrong now / Why / What happens next)
  const todaysThreeActions = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'stock' | 'staff' | 'beds' | 'stale';
      phcId: string;
      phcName: string;
      district: string;
      wrongNow: string;
      causeTag: string;
      causeTags: string[];
      med?: any;
      happensNext: string;
      buttonLabel: string;
      actionType: 'transfer' | 'cover' | 'beds' | 'update';
    }> = [];

    // 1. Most urgent stock issue across stock
    let lowestStock: { phc: PHC; med: any; days: number; qty: number } | null = null;
    for (const p of filteredPhcs) {
      for (const m of medicines) {
        const d = getDays(p.id, m.code);
        if (d < 7 && (!lowestStock || d < lowestStock.days)) {
          lowestStock = { phc: p, med: m, days: d, qty: stock[p.id]?.[m.code]?.quantity || 0 };
        }
      }
    }

    if (lowestStock) {
      const daysLeft = Math.max(0, Math.round(lowestStock.days));
      const phcDaysOld = getPhcDaysAgo(lowestStock.phc.id);
      const isStockOut = lowestStock.qty === 0;

      const primaryTag = isStockOut
        ? 'Stock-out'
        : activeEmergency
        ? `${activeEmergency.disease_or_hazard} surge`
        : upliftMap[lowestStock.med.code] > 1.2
        ? 'Dengue surge'
        : 'Seasonal demand';

      const tags: string[] = [primaryTag];
      if (phcDaysOld > 7) {
        tags.push(`Old data (${phcDaysOld} days)`);
      }

      const wrongNowText = isStockOut
        ? `Out of stock now: ${lowestStock.med.name} at ${lowestStock.phc.name} (0 units left)`
        : `Critical stock: ${lowestStock.med.name} at ${lowestStock.phc.name} (${lowestStock.qty} units left)`;

      const happensNextText = isStockOut
        ? `0 units buffer remaining — immediate transfer required today`
        : `Runs out in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} (${getFutureDayName(daysLeft)})`;

      list.push({
        id: `action_stock_${lowestStock.phc.id}_${lowestStock.med.code}`,
        type: 'stock',
        phcId: lowestStock.phc.id,
        phcName: lowestStock.phc.name,
        district: lowestStock.phc.district,
        wrongNow: wrongNowText,
        causeTag: primaryTag,
        causeTags: tags,
        med: lowestStock.med,
        happensNext: happensNextText,
        buttonLabel: 'Approve transfer',
        actionType: 'transfer',
      });
    }

    // 2. Urgent staff issue (No MO checked in today)
    const noMoPhc = filteredPhcs.find((p) => {
      const st = staff[p.id] || [];
      const mo = st.find((s) => s.is_mo || s.role === 'Medical Officer');
      return mo?.status !== 'present';
    });

    if (noMoPhc) {
      const phcDaysOld = getPhcDaysAgo(noMoPhc.id);
      const tags: string[] = ['No MO checked in'];
      if (phcDaysOld > 7) {
        tags.push(`Old data (${phcDaysOld} days)`);
      }

      list.push({
        id: `action_staff_${noMoPhc.id}`,
        type: 'staff',
        phcId: noMoPhc.id,
        phcName: noMoPhc.name,
        district: noMoPhc.district,
        wrongNow: `No Medical Officer on duty at ${noMoPhc.name}`,
        causeTag: 'No MO checked in',
        causeTags: tags,
        happensNext: 'OPD clinical triage delayed; patients turned away without cover',
        buttonLabel: 'Assign cover',
        actionType: 'cover',
      });
    }

    // 3. Bed saturation or stale data
    const bedSaturatedPhc = filteredPhcs.find((p) => beds[p.id] && beds[p.id].available <= 1);
    const stalePhc = filteredPhcs.find((p) => getPhcDaysAgo(p.id) > 7);

    if (bedSaturatedPhc) {
      const b = beds[bedSaturatedPhc.id];
      const phcDaysOld = getPhcDaysAgo(bedSaturatedPhc.id);
      const primaryTag = activeEmergency ? `${activeEmergency.disease_or_hazard} surge` : 'Surge admissions';
      const tags: string[] = [primaryTag];
      if (phcDaysOld > 7) {
        tags.push(`Old data (${phcDaysOld} days)`);
      }

      list.push({
        id: `action_beds_${bedSaturatedPhc.id}`,
        type: 'beds',
        phcId: bedSaturatedPhc.id,
        phcName: bedSaturatedPhc.name,
        district: bedSaturatedPhc.district,
        wrongNow: `Beds saturated at ${bedSaturatedPhc.name} (${b.occupied}/${b.total} occupied)`,
        causeTag: primaryTag,
        causeTags: tags,
        happensNext: 'Zero bed buffer remaining for acute triage in next 24h',
        buttonLabel: 'Refer to nearest beds',
        actionType: 'beds',
      });
    } else if (stalePhc) {
      const daysOld = getPhcDaysAgo(stalePhc.id);
      const primaryTag = `Old data (${daysOld} days)`;
      list.push({
        id: `action_stale_${stalePhc.id}`,
        type: 'stale',
        phcId: stalePhc.id,
        phcName: stalePhc.name,
        district: stalePhc.district,
        wrongNow: `Inventory data ${daysOld} days old at ${stalePhc.name}`,
        causeTag: primaryTag,
        causeTags: [primaryTag],
        happensNext: 'Ghost stockouts unverified by district supply officer',
        buttonLabel: 'Ask PHC to update',
        actionType: 'update',
      });
    }

    return list.slice(0, 3);
  }, [filteredPhcs, medicines, stock, beds, staff, activeEmergency, upliftMap, rules]);

  // Handle Action Button click
  const handlePerformAction = (action: {
    id: string;
    type: 'stock' | 'staff' | 'beds' | 'stale';
    phcId: string;
    buttonLabel: string;
    actionType: 'transfer' | 'cover' | 'beds' | 'update';
  }) => {
    if (action.actionType === 'transfer') {
      const pendingTransfer = transfers.find((t) => t.to_phc_id === action.phcId && t.status !== 'approved');
      if (pendingTransfer) {
        approveTransfer(pendingTransfer.id);
      } else {
        handlePlanTransfers();
      }
    }
    setCompletedActionIds((prev) => [...prev, action.id]);
  };

  // Determine if a PHC has any critical, warning or stale cells (for Exception-First grid)
  const isProblemPhc = (phc: PHC): boolean => {
    for (const med of medicines) {
      const d = getDays(phc.id, med.code);
      if (d <= 0 || d < rules.warning_threshold_days) return true;
      const stockItem = stock[phc.id]?.[med.code];
      const itemDaysAgo = stockItem?.last_updated
        ? Math.floor((Date.now() - new Date(stockItem.last_updated).getTime()) / (1000 * 60 * 60 * 24))
        : (stockItem?.last_updated_days_ago ?? getPhcDaysAgo(phc.id));
      if (itemDaysAgo > 7) return true;
    }
    const b = beds[phc.id];
    if (b && b.available <= 2) return true;
    const st = staff[phc.id] || [];
    const mo = st.find((s) => s.is_mo || s.role === 'Medical Officer');
    if (mo?.status !== 'present') return true;
    if (getPhcDaysAgo(phc.id) > 7) return true;
    return false;
  };

  const problemPhcsCount = useMemo(() => {
    return filteredPhcs.filter(isProblemPhc).length;
  }, [filteredPhcs, medicines, stock, beds, staff, rules, rawVsAdjusted, upliftMap, surgeMap]);

  const displayedGridPhcs = useMemo(() => {
    if (onlyProblems) {
      const problemRows = filteredPhcs.filter(isProblemPhc);
      return problemRows.length > 0 ? problemRows : filteredPhcs;
    }
    return filteredPhcs;
  }, [filteredPhcs, onlyProblems, medicines, stock, beds, staff, rules, rawVsAdjusted, upliftMap, surgeMap]);

  // Coverage suggestion without surveillance (never naming absent staff)
  const getCoverSuggestion = (targetPhc: PHC, moOnDuty: boolean) => {
    if (moOnDuty) return null;
    let nearestPhcWithMo: PHC | null = null;
    let minDistance = 999;
    for (const other of statePhcs) {
      if (other.id === targetPhc.id) continue;
      const otherStaff = staff[other.id] || [];
      const hasMo = otherStaff.find((s) => s.is_mo || s.role === 'Medical Officer')?.status === 'present';
      if (hasMo) {
        const dist = haversineDistance(targetPhc.lat, targetPhc.lng, other.lat, other.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestPhcWithMo = other;
        }
      }
    }

    if (nearestPhcWithMo) {
      return `Cover from ${nearestPhcWithMo.name} (${Math.round(minDistance * 10) / 10} km)`;
    }
    return 'District mobile cover team';
  };

  // Gemini Explain Shortage Action
  const handleExplain = async (
    phc: PHC,
    medCode: string,
    daysLeft: number
  ) => {
    const med = medicines.find((m) => m.code === medCode)!;
    const curStock = stock[phc.id]?.[medCode]?.quantity || 0;
    const dailyBurn = stock[phc.id]?.[medCode]?.daily_burn_rate || 20;

    const isSurge = Boolean(activeEmergency?.surge?.[medCode]);
    const uplift = upliftMap[medCode] || 1.0;
    const reasonText = isSurge
      ? `Active epidemic/emergency multiplier (${activeEmergency?.surge[medCode]}x) combined with seasonal vector-borne peak (${uplift}x uplift).`
      : `Seasonal consumption surge (${uplift}x uplift) from regional disease profile without recent buffer restocking.`;

    setExplainItem({
      phcName: phc.name,
      medName: med.name,
      days: daysLeft,
      stockQty: curStock,
      dailyBurn,
      reason: reasonText,
      loading: true,
    });

    const fallbackExplanation = `• High clinical burn (${dailyBurn} units/day) with seasonal acceleration has reduced reserve to ${daysLeft} days.\n• Immediate intra-district donor dispatch or central warehouse replenishment required within 48 hours.`;

    try {
      const prompt = getExplainShortagePrompt(
        phc.name,
        med.name,
        daysLeft,
        curStock,
        dailyBurn,
        reasonText
      );
      const res = await callGemini({ model: GEMINI_MODEL, contents: prompt });
      setExplainItem((prev) => (prev ? { ...prev, aiExplanation: res, loading: false } : null));
    } catch (e) {
      setExplainItem((prev) => (prev ? { ...prev, aiExplanation: fallbackExplanation, loading: false } : null));
    }
  };

  // Emergency Bulletin Parser
  const handleParseBulletin = async (overrideText?: string) => {
    let textToAnalyze = (overrideText || bulletinInput).trim();
    if (!textToAnalyze) {
      const defaultSample = selectedState === 'HR' ? SAMPLE_BULLETINS[0] : SAMPLE_BULLETINS[1];
      textToAnalyze = defaultSample.raw_text;
      setBulletinInput(textToAnalyze);
    }

    setIsParsingBulletin(true);

    // Find sample fallback if text matches
    const sample = SAMPLE_BULLETINS.find((b) => b.raw_text === textToAnalyze) || 
      (selectedState === 'HR' ? SAMPLE_BULLETINS[0] : SAMPLE_BULLETINS[1]);

    try {
      const prompt = getEmergencyBulletinPrompt(textToAnalyze);
      const res = await callGeminiJSON<EmergencySurgeExtraction>({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      const title = res.disease_or_hazard || 'Health Advisory Emergency Surge';
      activateEmergency(res, title, selectedState);
      setBulletinInput('');
    } catch (e) {
      activateEmergency(sample.sample_extraction, sample.title, selectedState);
      setBulletinInput('');
    } finally {
      setIsParsingBulletin(false);
    }
  };

  // Automated Cross-District Redistribution Planning
  const handlePlanTransfers = async () => {
    setIsPlanningTransfers(true);

    const generatedTransfers: TransferOrder[] = [];

    // Find candidate shortages across all PHCs in state
    for (const recipient of statePhcs) {
      for (const med of medicines) {
        const days = getDays(recipient.id, med.code);
        if (days < rules.warning_threshold_days) {
          const candidates = findRedistributionCandidates(
            recipient,
            med.code,
            statePhcs,
            stock,
            upliftMap,
            surgeMap,
            rules
          );

          if (candidates.length > 0) {
            const best = candidates[0]; // Nearest viable donor
            const transferId = `tr_${best.fromPhc.id}_${best.toPhc.id}_${med.code}_${Date.now()}`;

            // Check if already in transfers list
            const alreadyPlanned = transfers.some(
              (t) =>
                t.from_phc_id === best.fromPhc.id &&
                t.to_phc_id === best.toPhc.id &&
                t.med_code === med.code
            );

            if (!alreadyPlanned) {
              const orderTextLang = language === 'or' ? 'or' : 'hi';
              const fallbackOrderText =
                language === 'or'
                  ? `ପ୍ରେରଣ ଆଦେଶ: ${best.fromPhc.name} ରୁ ${best.quantity} ${med.unit} ${med.name} ତୁରନ୍ତ ${best.toPhc.name} କୁ ପଠାନ୍ତୁ।`
                  : `प्रेषण आदेश: ${best.fromPhc.name} से ${best.quantity} ${med.unit} ${med.name} तत्काल ${best.toPhc.name} को भेजी जाए।`;

              const fallbackRationale = `Optimal donor: ${best.fromPhc.name} (${best.distanceKm}km) retains ${best.donorRemainingDays} days buffer while delivering +${best.daysGained} days critical relief to ${best.toPhc.name}.`;

              generatedTransfers.push({
                id: transferId,
                from_phc_id: best.fromPhc.id,
                to_phc_id: best.toPhc.id,
                from_phc_name: best.fromPhc.name,
                to_phc_name: best.toPhc.name,
                from_district: best.fromPhc.district,
                to_district: best.toPhc.district,
                med_code: med.code,
                med_name: med.name,
                quantity: best.quantity,
                distance_km: best.distanceKm,
                days_gained: best.daysGained,
                donor_buffer_remaining_days: best.donorRemainingDays,
                recipient_current_days: best.recipientCurrentDays,
                status: best.isAutoDispatch ? 'auto_dispatched' : 'pending',
                english_rationale: fallbackRationale,
                local_order_text: fallbackOrderText,
                created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              });
            }
          }
        }
      }
    }

    if (generatedTransfers.length > 0) {
      // Sort most urgent first (lowest recipient stock days) and take at most 8
      generatedTransfers.sort((a, b) => (a.recipient_current_days ?? 999) - (b.recipient_current_days ?? 999));
      addTransfers(generatedTransfers.slice(0, 8));
    }

    setIsPlanningTransfers(false);
  };

  // Early Warnings under active emergency grouped by PHC
  const earlyWarningGroups = useMemo(() => {
    if (!activeEmergency) return [];

    const horizon = activeEmergency.horizon_days || 14;
    const groups: Array<{
      phcId: string;
      phcName: string;
      district: string;
      block: string;
      isAffectedLocation: boolean;
      minDaysToStockOut: number;
      items: Array<{
        type: 'stock' | 'beds' | 'staff';
        title: string;
        details: string;
        days?: number;
        urgency: 'critical' | 'high' | 'medium';
      }>;
    }> = [];

    statePhcs.forEach((phc) => {
      const items: Array<{
        type: 'stock' | 'beds' | 'staff';
        title: string;
        details: string;
        days?: number;
        urgency: 'critical' | 'high' | 'medium';
      }> = [];

      // Stockout within horizon
      medicines.forEach((m) => {
        const d = getDays(phc.id, m.code);
        if (d <= horizon) {
          items.push({
            type: 'stock',
            title: m.name,
            details: d <= 0 ? 'Stock-out (0 days remaining)' : `${d} days remaining`,
            days: d,
            urgency: d <= 0 ? 'critical' : d <= 3 ? 'high' : 'medium',
          });
        }
      });

      // Bed capacity
      const b = beds[phc.id];
      if (b && b.available <= 1) {
        items.push({
          type: 'beds',
          title: 'Bed Capacity Critical',
          details: `${b.occupied}/${b.total} occupied (${b.available} available)`,
          urgency: 'high',
        });
      }

      // Staffing
      const st = staff[phc.id] || [];
      const mo = st.find((s) => s.is_mo || s.role === 'Medical Officer');
      if (mo?.status !== 'present') {
        items.push({
          type: 'staff',
          title: 'Doctor Absent/Leave',
          details: `No Medical Officer on duty during active ${activeEmergency.disease_or_hazard} surge`,
          urgency: 'high',
        });
      }

      if (items.length > 0) {
        // Sort items inside this PHC by days ascending
        items.sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

        const stockItems = items.filter((it) => it.type === 'stock' && it.days !== undefined);
        const minDays = stockItems.length > 0 ? Math.min(...stockItems.map((it) => it.days!)) : 999;

        const isAffectedLocation =
          activeEmergency.affected_districts.some(
            (ad) =>
              ad.toLowerCase() === phc.district.toLowerCase() ||
              ad.toLowerCase().includes(phc.district.toLowerCase()) ||
              phc.district.toLowerCase().includes(ad.toLowerCase()) ||
              (phc.block && (ad.toLowerCase() === phc.block.toLowerCase() || ad.toLowerCase().includes(phc.block.toLowerCase())))
          );

        groups.push({
          phcId: phc.id,
          phcName: phc.name,
          district: phc.district,
          block: phc.block,
          isAffectedLocation,
          minDaysToStockOut: minDays,
          items,
        });
      }
    });

    // Requirement 2:
    // Sort by days to stock-out ascending, and list PHCs in the bulletin's affected districts/blocks first.
    return groups.sort((a, b) => {
      // 1. Bulletin's affected districts/blocks first
      if (a.isAffectedLocation !== b.isAffectedLocation) {
        return a.isAffectedLocation ? -1 : 1;
      }
      // 2. Sort by days to stock-out ascending
      return a.minDaysToStockOut - b.minDaysToStockOut;
    });
  }, [activeEmergency, statePhcs, medicines, beds, staff, stock, rawVsAdjusted]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner: District Filter + Season + Forecast Mode Switch (Desktop 640px+) */}
      <div className="hidden sm:flex bg-white rounded-[8px] p-6 border border-[#D0D5DD] flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* District selector with visible label */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#163D6E]" aria-hidden="true" />
            <label htmlFor="district-select" className="text-sm font-semibold text-[#101828]">
              District:
            </label>
            <select
              id="district-select"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="py-2 px-3 min-h-[48px] rounded-[8px] border border-[#D0D5DD] bg-white text-sm font-semibold text-[#101828] cursor-pointer hover:bg-[#F5F7FA] transition-colors focus:ring-2 focus:ring-[#163D6E]"
            >
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All districts' : d}
                </option>
              ))}
            </select>
          </div>

          {/* Season banner badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#FFFAEB] border border-[#FEDF89] text-[#B54708] text-sm font-medium">
            <TrendingUp className="w-4 h-4 text-[#B54708] shrink-0" aria-hidden="true" />
            <span>
              <strong>Season profile:</strong> {selectedState === 'HR' ? 'Post-monsoon dengue and vector surveillance' : 'Coastal monsoon and water-borne surveillance'}
            </span>
          </div>
        </div>

        {/* Forecast Uplift Toggle: Raw vs Adjusted */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#101828]">Forecast rate:</span>
          <div className="flex items-center bg-[#F5F7FA] p-1 rounded-[8px] border border-[#D0D5DD]">
            <button
              type="button"
              onClick={() => setRawVsAdjusted('raw')}
              className={`min-h-[44px] px-3.5 py-1 rounded-[6px] transition-colors cursor-pointer flex flex-col items-center justify-center ${
                rawVsAdjusted === 'raw'
                  ? 'bg-[#163D6E] text-white'
                  : 'text-[#344054] hover:text-[#101828]'
              }`}
            >
              <span lang="hi" className="font-semibold text-xs leading-none">सामान्य</span>
              <span lang="en" className="text-[11px] opacity-80 font-normal leading-none mt-0.5">Normal</span>
            </button>
            <button
              type="button"
              onClick={() => setRawVsAdjusted('adjusted')}
              className={`min-h-[44px] px-3.5 py-1 rounded-[6px] transition-colors cursor-pointer flex flex-col items-center justify-center ${
                rawVsAdjusted === 'adjusted'
                  ? 'bg-[#163D6E] text-white'
                  : 'text-[#344054] hover:text-[#101828]'
              }`}
            >
              <span lang="hi" className="font-semibold text-xs leading-none">मौसम अनुसार</span>
              <span lang="en" className="text-[11px] opacity-80 font-normal leading-none mt-0.5">Season-adjusted</span>
            </button>
          </div>
        </div>
      </div>

      {/* Today's 3 actions */}
      <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D0D5DD] pb-4">
          <div>
            <h2 className="text-xl font-semibold text-[#101828]">
              <div lang="hi">आज के 3 मुख्य काम</div>
              <div lang="en" className="text-sm font-normal text-[#475467] mt-0.5">Today's 3 actions</div>
            </h2>
          </div>
          {todaysThreeActions.length > 0 && todaysThreeActions.every((a) => completedActionIds.includes(a.id)) ? (
            <span className="px-3 py-1.5 rounded-[8px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] text-sm font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#067647]" aria-hidden="true" />
              <span>All clear for today</span>
            </span>
          ) : (
            <span className="text-sm text-[#475467] font-medium">
              {completedActionIds.filter((id) => todaysThreeActions.some((a) => a.id === id)).length} of{' '}
              {todaysThreeActions.length} completed
            </span>
          )}
        </div>

        {todaysThreeActions.length > 0 && todaysThreeActions.every((a) => completedActionIds.includes(a.id)) ? (
          <div className="p-4 bg-[#ECFDF3] border border-[#A6F4C5] rounded-[8px] flex items-center justify-between text-[#067647]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#067647] shrink-0" aria-hidden="true" />
              <div>
                <span className="font-semibold text-base block text-[#067647]">All clear for today</span>
                <span className="text-sm text-[#344054]">
                  All critical clinical priorities across stock, beds, and staff have been addressed.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompletedActionIds([])}
              className="text-sm font-semibold text-[#163D6E] underline hover:text-[#0F2B4E] cursor-pointer min-h-[48px] px-3"
            >
              Reset actions
            </button>
          </div>
        ) : todaysThreeActions.length === 0 ? (
          <div className="p-4 bg-[#ECFDF3] border border-[#A6F4C5] rounded-[8px] flex items-center gap-3 text-[#067647]">
            <CheckCircle2 className="w-6 h-6 text-[#067647] shrink-0" aria-hidden="true" />
            <span className="font-semibold text-base">All clear for today</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {todaysThreeActions.map((act) => {
              const isDone = completedActionIds.includes(act.id);
              return (
                <div
                  key={act.id}
                  className={`p-5 rounded-[8px] border flex flex-col justify-between space-y-4 transition-colors ${
                    isDone
                      ? 'bg-[#F5F7FA] border-[#D0D5DD] opacity-75'
                      : 'bg-white border-[#D0D5DD] hover:border-[#163D6E]'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Cause tags matching real reasons (Stock-out / surge, and Old data if > 7 days) */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(act.causeTags || [act.causeTag]).map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] text-xs font-semibold ${
                              tag === 'Stock-out' || tag.startsWith('Old data')
                                ? 'bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B]'
                                : 'bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89]'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-[#475467] font-medium">{act.district}</span>
                    </div>

                    {/* Level 1: What's wrong now */}
                    <div>
                      <span className="text-xs font-semibold text-[#475467] block">
                        What's wrong now
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {act.med && (
                          <MedicinePictogram form={act.med.form || act.med.unit || act.med.category || act.med.name} className="w-5 h-5 text-[#163D6E] shrink-0" />
                        )}
                        <p className="text-base font-semibold text-[#101828] leading-snug">
                          {act.wrongNow}
                        </p>
                      </div>
                    </div>

                    {/* Level 3: What happens next */}
                    <div className="pt-2 border-t border-[#D0D5DD]">
                      <span className="text-xs font-semibold text-[#475467] block">
                        What happens next
                      </span>
                      <p className="text-sm text-[#B42318] font-semibold mt-0.5 leading-snug">
                        {act.happensNext}
                      </p>
                    </div>
                  </div>

                  {/* ONE primary button with recommended action */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handlePerformAction(act)}
                      disabled={isDone}
                      className={`w-full min-h-[48px] py-2.5 px-4 rounded-[8px] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        isDone
                          ? 'bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] cursor-default'
                          : 'bg-[#163D6E] hover:bg-[#0F2B4E] text-white'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <Check className="w-4 h-4" aria-hidden="true" />
                          <span>Action completed</span>
                        </>
                      ) : (
                        <span>{act.buttonLabel}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* REQUIREMENT 6: Under 640px, show "Today's 3 actions" first, then list view */}
      {/* instead of the heavy Leaflet map and 16-column resource grid               */}
      {/* ========================================================================= */}
      <div className="sm:hidden space-y-4">
        <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D0D5DD] pb-3">
            <div>
              <h3 className="font-semibold text-base text-[#101828]">
                <BilingualText primary="प्राथमिक स्वास्थ्य केंद्र स्थिति" enSub="Facility status list" lang={language} />
              </h3>
              <p className="text-xs text-[#475467]">
                <BilingualText primary="लाइव स्टॉक, बिस्तर एवं डॉक्टर स्थिति" enSub="Stock buffer, beds, and medical officer presence" lang={language} />
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#F5F7FA] border border-[#D0D5DD] text-[#344054]">
              {filteredPhcs.length} PHCs
            </span>
          </div>

          {/* Quick District filter on mobile */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#163D6E]" aria-hidden="true" />
            <label htmlFor="mobile-district-select" className="text-xs font-semibold text-[#101828]">
              <BilingualText primary="ज़िला" enSub="District:" lang={language} />
            </label>
            <select
              id="mobile-district-select"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="flex-1 py-1.5 px-2.5 min-h-[44px] rounded-[6px] border border-[#D0D5DD] bg-white text-xs font-semibold text-[#101828]"
            >
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All districts' : d}
                </option>
              ))}
            </select>
          </div>

          {/* PHC Cards List */}
          <div className="space-y-3 pt-1">
            {filteredPhcs.map((phc) => {
              const topProblem = getTopProblem(phc);
              const bedInfo = beds[phc.id] || { total: 10, occupied: 5, available: 5 };
              const staffMembers = staff[phc.id] || [];
              const moPresent = staffMembers.find((s) => s.is_mo || s.role === 'Medical Officer')?.status === 'present';

              return (
                <div key={phc.id} className="p-3.5 rounded-[8px] border border-[#D0D5DD] bg-[#F5F7FA] space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-base font-semibold text-[#101828] block">{phc.name}</strong>
                      <span className="text-xs text-[#475467]">{phc.district} · {phc.block}</span>
                    </div>
                    {/* Non-color-only symbol & badge */}
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold border"
                      style={{
                        backgroundColor: topProblem.type === 'critical' ? '#FEF3F2' : topProblem.type === 'low' ? '#FFFAEB' : '#ECFDF3',
                        color: topProblem.color,
                        borderColor: topProblem.color,
                      }}
                    >
                      {topProblem.type === 'critical' && <span>!</span>}
                      {topProblem.type === 'low' && <span>▲</span>}
                      {topProblem.type === 'ok' && <span>✓</span>}
                      {topProblem.type === 'stale' && <span>■</span>}
                      <span>{topProblem.label}</span>
                    </span>
                  </div>

                  <div className="text-xs text-[#344054] bg-white p-2.5 rounded-[6px] border border-[#D0D5DD] leading-relaxed">
                    <strong>Status:</strong> {topProblem.problemText}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-[#D0D5DD]">
                    <div>
                      <span className="text-[#475467] block">Available beds</span>
                      <strong className="text-sm text-[#101828]">{bedInfo.available} / {bedInfo.total}</strong>
                    </div>
                    <div>
                      <span className="text-[#475467] block">Medical officer</span>
                      <strong className={`text-sm ${moPresent ? 'text-[#067647]' : 'text-[#B42318]'}`}>
                        {moPresent ? 'Present' : 'Absent'}
                      </strong>
                    </div>
                  </div>

                  {phc.contact_phone && (
                    <div className="text-[11px] text-[#475467] pt-1">
                      Contact: {phc.contact_phone}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI Cards Row (Desktop 640px+) */}
      <div className="hidden sm:grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* KPI 1: Fresh Data */}
        <div className="bg-white rounded-[8px] p-5 border border-[#D0D5DD]">
          <div className="flex items-center justify-between text-[#344054] mb-1">
            <span className="text-sm font-semibold">Fresh data PHCs</span>
            <CheckCircle2 className="w-4 h-4 text-[#067647]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#101828] mt-1">{kpiData.freshPhcs}</div>
          <span className="inline-flex items-center gap-1 text-xs text-[#067647] font-medium mt-1">
            <Check className="w-3 h-3" aria-hidden="true" />
            Within 7 days
          </span>
        </div>

        {/* KPI 2: Critical Medicines */}
        <div className="bg-white rounded-[8px] p-5 border border-[#D0D5DD]">
          <div className="flex items-center justify-between text-[#344054] mb-1">
            <span className="text-sm font-semibold">Critical stock</span>
            <AlertCircle className="w-4 h-4 text-[#B42318]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#B42318] mt-1">{kpiData.criticalMeds}</div>
          <span className="inline-flex items-center gap-1 text-xs text-[#B42318] font-medium mt-1">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            Under 7 days buffer
          </span>
        </div>

        {/* KPI 3: Available Beds */}
        <div className="bg-white rounded-[8px] p-5 border border-[#D0D5DD]">
          <div className="flex items-center justify-between text-[#344054] mb-1">
            <span className="text-sm font-semibold">Available beds</span>
            <Bed className="w-4 h-4 text-[#163D6E]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#163D6E] mt-1">{kpiData.freeBeds}</div>
          <span className="text-xs text-[#475467] block mt-1">Across {filteredPhcs.length} PHCs</span>
        </div>

        {/* KPI 4: PHCs without MO today */}
        <div className="bg-white rounded-[8px] p-5 border border-[#D0D5DD]">
          <div className="flex items-center justify-between text-[#344054] mb-1">
            <span className="text-sm font-semibold">No doctor on duty</span>
            <Users className="w-4 h-4 text-[#B54708]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#B54708] mt-1">{kpiData.noMoPhcs}</div>
          <span className="inline-flex items-center gap-1 text-xs text-[#B54708] font-medium mt-1">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            Require nurse cover
          </span>
        </div>

        {/* KPI 5: Transfers Pending */}
        <div className="bg-white rounded-[8px] p-5 border border-[#D0D5DD]">
          <div className="flex items-center justify-between text-[#344054] mb-1">
            <span className="text-sm font-semibold">Active transfers</span>
            <Truck className="w-4 h-4 text-[#163D6E]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#101828] mt-1">{kpiData.pendingTransfers}</div>
          <span className="text-xs text-[#475467] block mt-1">Auto or pending sign-off</span>
        </div>
      </div>

      {/* Map & Emergency Hub Grid (Desktop 640px+) */}
      <div className="hidden sm:grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Geospatial Map with View as List alternative */}
        <div className="lg:col-span-7 bg-white rounded-[8px] border border-[#D0D5DD] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-[#D0D5DD] flex flex-wrap items-center justify-between gap-3 bg-[#F5F7FA]">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
              <h3 className="font-semibold text-base text-[#101828]">
                PHC geospatial supply map
              </h3>
              <span className="text-sm text-[#475467]">({selectedState === 'HR' ? 'Haryana' : 'Odisha'})</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View as list / Map view toggle (WCAG 2.1 AA / GIGW 3.0 Requirement) */}
              <div className="flex items-center bg-white p-1 rounded-[8px] border border-[#D0D5DD] text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMapViewMode('map');
                    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 50);
                  }}
                  className={`min-h-[48px] px-3.5 py-1.5 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                    mapViewMode === 'map'
                      ? 'bg-[#163D6E] text-white'
                      : 'text-[#344054] hover:text-[#101828]'
                  }`}
                >
                  Map view
                </button>
                <button
                  type="button"
                  onClick={() => setMapViewMode('list')}
                  className={`min-h-[48px] px-3.5 py-1.5 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                    mapViewMode === 'list'
                      ? 'bg-[#163D6E] text-white'
                      : 'text-[#344054] hover:text-[#101828]'
                  }`}
                >
                  View as list
                </button>
              </div>

              {/* Layer Toggles */}
              <div className="flex items-center bg-white p-1 rounded-[8px] border border-[#D0D5DD] text-sm">
                <button
                  type="button"
                  onClick={() => setMapLayer('stock')}
                  className={`min-h-[48px] px-3 py-1.5 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                    mapLayer === 'stock'
                      ? 'bg-[#163D6E] text-white'
                      : 'text-[#344054] hover:text-[#101828]'
                  }`}
                >
                  Stock
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayer('beds')}
                  className={`min-h-[48px] px-3 py-1.5 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                    mapLayer === 'beds'
                      ? 'bg-[#163D6E] text-white'
                      : 'text-[#344054] hover:text-[#101828]'
                  }`}
                >
                  Beds
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayer('staff')}
                  className={`min-h-[48px] px-3 py-1.5 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                    mapLayer === 'staff'
                      ? 'bg-[#163D6E] text-white'
                      : 'text-[#344054] hover:text-[#101828]'
                  }`}
                >
                  Doctor / Staff
                </button>
              </div>
            </div>
          </div>

          {/* View as Map */}
          <div className={`flex flex-col flex-1 min-h-[380px] ${mapViewMode === 'list' ? 'hidden' : 'block'}`}>
            <div ref={mapContainerRef} className="w-full flex-1 min-h-[380px]" />

            {/* Requirement 4: Visible Legend under map with non-color-only indicators (circle !, triangle ▲, circle ✓, square ■) */}
            <div className="bg-[#F5F7FA] p-3 border-t border-[#D0D5DD] text-xs sm:text-sm flex flex-wrap items-center gap-3 sm:gap-6">
              <span className="font-semibold text-[#101828]">
                <BilingualText primary="नक्शा संकेत" enSub="Map legend:" lang={language} />
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#B42318] text-white font-bold text-xs flex items-center justify-center border border-white">!</span>
                <span className="text-[#344054]">
                  <BilingualText primary="अति गंभीर (<7 दिन / 0 बेड)" enSub="Critical (<7d stock / 0 beds / absent MO)" lang={language} />
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 text-[#B54708] font-bold text-sm flex items-center justify-center">▲</span>
                <span className="text-[#344054]">
                  <BilingualText primary="चेतावनी (7–14 दिन बफ़र)" enSub="Low buffer (7–14 days)" lang={language} />
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#067647] text-white font-bold text-xs flex items-center justify-center border border-white">✓</span>
                <span className="text-[#344054]">
                  <BilingualText primary="सामान्य (>14 दिन बफ़र)" enSub="OK (>14 days buffer)" lang={language} />
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-[2px] bg-[#475467] text-white font-bold text-[10px] flex items-center justify-center border border-white">■</span>
                <span className="text-[#344054]">
                  <BilingualText primary="पुराना डेटा (>7 दिन)" enSub="Old data (>7 days)" lang={language} />
                </span>
              </div>
            </div>
          </div>

          {/* View as List Alternative (WCAG 2.1 AA / GIGW 3.0) */}
          {mapViewMode === 'list' && (
            <div className="overflow-x-auto flex-1 p-2">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-[#F5F7FA] border-b border-[#D0D5DD] text-[#101828] font-semibold sticky top-0">
                    <th className="py-3 px-3">Primary health centre</th>
                    <th className="py-3 px-3">District &amp; block</th>
                    <th className="py-3 px-3">Stock status</th>
                    <th className="py-3 px-3 text-center">Available beds</th>
                    <th className="py-3 px-3 text-center">Medical officer</th>
                    <th className="py-3 px-3">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D0D5DD]">
                  {filteredPhcs.map((phc) => {
                    const worst = getPhcStatus(phc);
                    const bedInfo = beds[phc.id] || { total: 10, occupied: 5, available: 5 };
                    const staffMembers = staff[phc.id] || [];
                    const moPresent = staffMembers.find((s) => s.is_mo)?.status === 'present';
                    const daysAgo = getPhcDaysAgo(phc.id);

                    return (
                      <tr key={phc.id} className="odd:bg-white even:bg-[#F5F7FA] hover:bg-gray-100 transition-colors">
                        <td className="py-3 px-3 font-semibold text-[#101828]">
                          {phc.name}
                        </td>
                        <td className="py-3 px-3 text-[#344054]">
                          {phc.district} · {phc.block}
                        </td>
                        <td className="py-3 px-3">
                          {worst.status === 'critical' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] font-semibold text-xs">
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                              Critical
                            </span>
                          ) : worst.status === 'warning' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] font-semibold text-xs">
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                              Low
                            </span>
                          ) : worst.status === 'stale' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] font-semibold text-xs">
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                              Old data ({daysAgo}d)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] font-semibold text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              OK
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center text-[#101828] font-semibold">
                          {bedInfo.available} / {bedInfo.total}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {moPresent ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#067647]">
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              Present
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B42318]">
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                              Absent
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-[#475467]">
                          {phc.contact_phone}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Emergency Mode & Health Bulletin Parser */}
        <div className="lg:col-span-5 bg-white rounded-[8px] border border-[#D0D5DD] p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D0D5DD]">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#B42318] shrink-0" aria-hidden="true" />
                <div className="flex flex-col">
                  <h3 lang="hi" className="font-semibold text-base text-[#101828] leading-tight">स्वास्थ्य आपात स्थिति</h3>
                  <span lang="en" className="text-xs text-[#475467] font-normal leading-tight mt-0.5">Health emergency</span>
                </div>
              </div>
              {activeEmergency && (
                <span className="px-2.5 py-0.5 rounded-[8px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] text-xs font-semibold">
                  Surge active
                </span>
              )}
            </div>

            <p className="text-sm text-[#344054]">
              Paste epidemic surveillance advisories or disaster alerts. Gemini translates free-text orders into demand multipliers.
            </p>

            {/* Quick Sample Bulletin Buttons without emojis */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#475467] block">Sample official bulletins:</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const sample = SAMPLE_BULLETINS[0];
                    setBulletinInput(sample.raw_text);
                    handleParseBulletin(sample.raw_text);
                  }}
                  className="flex-1 text-left p-2.5 rounded-[8px] bg-[#FFFAEB] hover:bg-[#FEDF89]/50 border border-[#FEDF89] text-xs text-[#B54708] font-semibold cursor-pointer flex items-center gap-1.5"
                  title="Dengue outbreak in Nuh (Haryana)"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Dengue alert (Nuh, HR)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sample = SAMPLE_BULLETINS[1];
                    setBulletinInput(sample.raw_text);
                    handleParseBulletin(sample.raw_text);
                  }}
                  className="flex-1 text-left p-2.5 rounded-[8px] bg-[#F5F7FA] hover:bg-gray-200 border border-[#D0D5DD] text-xs text-[#163D6E] font-semibold cursor-pointer flex items-center gap-1.5"
                  title="Cyclone warning near Puri (Odisha)"
                >
                  <Compass className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Cyclone warning (Puri, OD)</span>
                </button>
              </div>
            </div>

            {/* Bulletin text area with visible label */}
            <div className="space-y-2 pt-1">
              <label htmlFor="bulletin-input-field" className="block text-sm font-semibold text-[#101828]">
                Advisory or bulletin text
              </label>
              <textarea
                id="bulletin-input-field"
                value={bulletinInput}
                onChange={(e) => setBulletinInput(e.target.value)}
                placeholder="Paste epidemic alert or disaster bulletin text here..."
                rows={3}
                className="w-full text-sm p-3 border border-[#D0D5DD] rounded-[8px] outline-none focus:ring-2 focus:ring-[#163D6E] resize-none bg-white text-[#101828]"
              />
              <button
                type="button"
                onClick={() => handleParseBulletin()}
                disabled={isParsingBulletin}
                className="w-full min-h-[48px] py-2.5 px-4 bg-[#B42318] hover:bg-[#911c13] text-white font-semibold text-sm rounded-[8px] flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {isParsingBulletin ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Extracting surge parameters...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-5 h-5 text-white shrink-0" aria-hidden="true" />
                    <div className="flex flex-col items-center justify-center leading-tight">
                      <span lang="hi" className="font-semibold text-sm">आपात अनुमान लगाएँ</span>
                      <span lang="en" className="text-xs opacity-90 font-normal mt-0.5">Apply emergency forecast</span>
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Emergency Status Summary */}
          {activeEmergency && (
            <div className="p-4 bg-[#FEF3F2] border border-[#FDA29B] rounded-[8px] text-sm space-y-2">
              <div className="flex items-center justify-between font-semibold text-[#B42318]">
                <span>{activeEmergency.disease_or_hazard}</span>
                <span className="text-xs bg-[#B42318] text-white px-2 py-0.5 rounded-[6px]">
                  Severity {activeEmergency.severity}/5
                </span>
              </div>
              <div className="text-sm text-[#344054]">
                <strong>Affected ({selectedState === 'HR' ? 'Haryana' : 'Odisha'}):</strong> {activeEmergency.affected_districts.join(', ')} (Horizon: {activeEmergency.horizon_days}d)
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(activeEmergency.surge).map(([code, mult]) => (
                  <span key={code} className="px-2 py-0.5 bg-white text-[#B42318] border border-[#FDA29B] rounded-[6px] text-xs font-semibold">
                    {code}: {mult}x surge
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => clearEmergency(selectedState)}
                className="text-sm text-[#B42318] underline font-semibold mt-1 block cursor-pointer hover:text-black"
              >
                Deactivate emergency mode
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Early Warning Alerts under Active Emergency (White Card with Red Left Border) */}
      {activeEmergency && earlyWarningGroups.length > 0 && (
        <div className="early-warning-card p-6 rounded-[8px] bg-white border border-[#D0D5DD] border-l-4 border-l-[#B42318] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D0D5DD] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-[8px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B]">
                <AlertOctagon className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold text-lg text-[#101828]">
                  Early warning stock-out and capacity projections ({selectedState === 'HR' ? 'Haryana' : 'Odisha'})
                </h3>
                <p className="text-sm text-[#475467]">
                  Horizon: {activeEmergency.horizon_days} days · {earlyWarningGroups.length} at-risk primary health centres
                </p>
              </div>
            </div>
          </div>

          {/* Grouped by PHC (one card per PHC listing its items) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(showAllWarnings ? earlyWarningGroups : earlyWarningGroups.slice(0, 3)).map((group) => (
              <div
                key={group.phcId}
                className="p-4 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] space-y-3 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-base text-[#101828] leading-snug">{group.phcName}</h4>
                    <p className="text-xs text-[#475467] mt-0.5">
                      {group.district}{group.block ? ` · Block: ${group.block}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {group.isAffectedLocation && (
                      <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89]">
                        Surge area
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B]">
                      {group.minDaysToStockOut <= 0
                        ? 'Stockout (0d)'
                        : `${group.minDaysToStockOut}d to stockout`}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#D0D5DD]">
                  {group.items.map((it, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#B42318] shrink-0" aria-hidden="true" />
                        <span className="font-semibold text-[#101828] truncate">{it.title}:</span>
                        <span className="text-[#344054] truncate">{it.details}</span>
                      </div>
                      {it.days !== undefined && (
                        <span className="font-semibold text-[#B42318] shrink-0">
                          {it.days <= 0 ? '0d' : `${it.days}d`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {earlyWarningGroups.length > 3 && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllWarnings(!showAllWarnings)}
                className="min-h-[48px] px-4 py-2 rounded-[8px] bg-white hover:bg-[#F5F7FA] text-[#101828] font-semibold text-sm border border-[#D0D5DD] transition-colors cursor-pointer"
              >
                <span>{showAllWarnings ? 'Collapse alerts (top 3)' : `+${earlyWarningGroups.length - 3} more critical alerts`}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Resource Grid (Desktop 640px+, Exception-first by default) */}
      <div className="hidden sm:block bg-white rounded-[8px] border border-[#D0D5DD] overflow-hidden space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D0D5DD] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-[#101828]">
                Facility resource grid
              </h3>
              <span className="px-2.5 py-0.5 rounded-[8px] text-xs font-semibold bg-[#F5F7FA] text-[#163D6E] border border-[#D0D5DD]">
                Exception-first
              </span>
            </div>
            <p className="text-sm text-[#475467] mt-1">
              Real-time days of stock buffer, available beds, and clinical duty coverage across all primary healthcare centres.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Exception-first filter toggle */}
            <div className="flex items-center bg-[#F5F7FA] p-1 rounded-[8px] border border-[#D0D5DD] text-sm">
              <button
                type="button"
                onClick={() => setOnlyProblems(true)}
                className={`min-h-[40px] px-3.5 py-1 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                  onlyProblems
                    ? 'bg-[#163D6E] text-white'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                Only problems ({problemPhcsCount})
              </button>
              <button
                type="button"
                onClick={() => setOnlyProblems(false)}
                className={`min-h-[40px] px-3.5 py-1 rounded-[6px] transition-colors cursor-pointer font-semibold ${
                  !onlyProblems
                    ? 'bg-[#163D6E] text-white'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                Show all {filteredPhcs.length} PHCs
              </button>
            </div>

            {/* Redistribution Action Button */}
            <button
              type="button"
              onClick={handlePlanTransfers}
              disabled={isPlanningTransfers}
              className="min-h-[48px] px-4 py-2 bg-[#163D6E] hover:bg-[#0F2B4E] text-white rounded-[8px] text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              {isPlanningTransfers ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Computing intra-state donors...</span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" aria-hidden="true" />
                  <span>Plan transfers and cover</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Accessible Data Table with Sticky Header, Full Column Names, and Sticky First Column (Requirement 6) */}
        <div className="overflow-auto max-h-[500px] border border-[#D0D5DD] rounded-[8px] bg-white">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] border-b border-[#D0D5DD] text-[#101828] font-semibold sticky top-0 z-20">
                <th className="py-3 px-3.5 sticky left-0 top-0 bg-[#F5F7FA] z-30 min-w-[170px] shadow-[1px_0_0_0_#D0D5DD]">
                  Primary health centre
                </th>
                <th className="py-3 px-3 min-w-[100px]">District</th>
                {medicines.map((m) => (
                  <th
                    key={m.code}
                    className="py-3 px-2 text-center min-w-[110px]"
                    title={`${m.name} (${m.molecule})`}
                  >
                    <div className="flex items-center justify-center gap-1 font-semibold text-[#101828] leading-tight">
                      <MedicinePictogram form={m.form || m.unit || m.category || m.name} className="w-3.5 h-3.5 text-[#163D6E] shrink-0" />
                      <span>{m.name.split(' ')[0]}</span>
                    </div>
                    <div className="text-xs text-[#475467] font-normal mt-0.5">
                      {m.code}
                    </div>
                  </th>
                ))}
                <th className="py-3 px-3 text-center min-w-[100px]">Available beds</th>
                <th className="py-3 px-3 text-center min-w-[110px]">Medical officer</th>
                <th className="py-3 px-3 text-center min-w-[90px]">Staff coverage</th>
                <th className="py-3 px-3 text-left min-w-[180px]">Cover recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D0D5DD]">
              {displayedGridPhcs.map((phc) => {
                const bed = beds[phc.id] || { total: 10, occupied: 5, available: 5 };
                const st = staff[phc.id] || [];
                const presentCount = st.filter((s) => s.status === 'present').length;
                const staffPercent = st.length > 0 ? Math.round((presentCount / st.length) * 100) : 0;
                const moOnDuty = st.find((s) => s.is_mo || s.role === 'Medical Officer')?.status === 'present';
                const daysAgo = getPhcDaysAgo(phc.id);
                const isStale = daysAgo > 7;
                const coverSuggestion = getCoverSuggestion(phc, moOnDuty);

                return (
                  <tr key={phc.id} className="odd:bg-white even:bg-[#F5F7FA] hover:bg-gray-100 transition-colors">
                    <td className="py-3 px-3.5 font-semibold text-[#101828] sticky left-0 bg-white hover:bg-gray-100 z-10 shadow-[1px_0_0_0_#D0D5DD]">
                      <div className="flex items-center gap-1.5">
                        {isStale && (
                          <span title="Old data (>7 days)" className="text-[#B42318]">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          </span>
                        )}
                        <span>{phc.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#344054]">{phc.district}</td>

                    {/* 12 Medicines Days of Stock - Always Icon + Word on Pale Tint */}
                    {medicines.map((m) => {
                      const days = getDays(phc.id, m.code);
                      const isCritical = days <= 0 || days < rules.critical_threshold_days;
                      const isWarning = !isCritical && days < rules.warning_threshold_days;

                      const stockItem = stock[phc.id]?.[m.code];
                      const itemDaysAgo = stockItem?.last_updated
                        ? Math.floor((Date.now() - new Date(stockItem.last_updated).getTime()) / (1000 * 60 * 60 * 24))
                        : (stockItem?.last_updated_days_ago ?? daysAgo);
                      const isItemStale = itemDaysAgo > 7;

                      if (!isCritical && !isWarning && !isItemStale) {
                        return (
                          <td key={m.code} className="py-2.5 px-2 text-center">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] text-xs font-semibold cursor-default"
                              title={`${m.name}: Adequate stock (${Math.round(days)}d buffer)`}
                            >
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              OK
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={m.code} className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => (isCritical || isWarning) && handleExplain(phc, m.code, days)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-xs font-semibold cursor-pointer border ${
                              isCritical
                                ? 'bg-[#FEF3F2] text-[#B42318] border-[#FDA29B] hover:bg-red-100'
                                : isWarning
                                ? 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] hover:bg-amber-100'
                                : 'bg-[#FEF3F2] text-[#B42318] border-[#FDA29B]'
                            }`}
                            title={`${isCritical ? 'Critical (<7d)' : isWarning ? 'Low (7–14d)' : 'Old data'} · ${Math.round(days)} days buffer`}
                          >
                            {isCritical ? (
                              <>
                                <AlertTriangle className="w-3 h-3 text-[#B42318]" aria-hidden="true" />
                                <span>Critical ({Math.round(days)}d)</span>
                              </>
                            ) : isWarning ? (
                              <>
                                <AlertTriangle className="w-3 h-3 text-[#B54708]" aria-hidden="true" />
                                <span>Low ({Math.round(days)}d)</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-[#B42318]" aria-hidden="true" />
                                <span>Old data</span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}

                    {/* Beds Free */}
                    <td className="py-3 px-3 text-center">
                      {bed.available <= 2 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                          Critical ({bed.available})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                          OK ({bed.available})
                        </span>
                      )}
                    </td>

                    {/* Medical Officer on Duty (Coverage, not surveillance) */}
                    <td className="py-3 px-3 text-center">
                      {moOnDuty ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                          OK · Present
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                          Critical · Absent
                        </span>
                      )}
                    </td>

                    {/* Staff Percentage */}
                    <td className="py-3 px-3 text-center font-semibold text-[#101828]">
                      {staffPercent}%
                    </td>

                    {/* Cover Suggestion (Coverage, not surveillance) */}
                    <td className="py-3 px-3 text-left">
                      {coverSuggestion ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89]">
                          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                          {coverSuggestion}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-[#067647] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Full coverage
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Redistribution Orders Section */}
      <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D0D5DD] pb-4">
          <div>
            <h3 className="font-semibold text-lg text-[#101828] flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
              <span>Automated cross-district redistribution orders</span>
            </h3>
            <p className="text-sm text-[#475467] mt-0.5">
              Deterministic donor optimization (donor keeps ≥ 14 days buffer) paired with bilingual dispatch orders.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePlanTransfers}
            className="min-h-[48px] px-3.5 py-1.5 text-sm text-[#163D6E] hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Re-scan shortage candidates</span>
          </button>
        </div>

        {transfers.length === 0 ? (
          <div className="p-8 text-center text-[#475467] bg-[#F5F7FA] rounded-[8px] border border-[#D0D5DD] text-sm space-y-3">
            <p>No active transfer dispatches generated yet.</p>
            <button
              type="button"
              onClick={handlePlanTransfers}
              className="min-h-[50px] px-5 py-2 bg-[#163D6E] text-white rounded-[8px] font-semibold hover:bg-[#0F2B4E] transition-colors cursor-pointer flex flex-col items-center justify-center mx-auto"
            >
              <span lang="hi" className="font-semibold text-sm leading-tight">दवा भेजने के सुझाव</span>
              <span lang="en" className="text-xs opacity-90 font-normal leading-tight mt-0.5">Find medicine to move</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedTransfers.map((t) => {
              const isAuto = t.status === 'auto_dispatched';
              const isApproved = t.status === 'approved';

              return (
                <div
                  key={t.id}
                  className={`p-5 rounded-[8px] border space-y-3 transition-colors ${
                    isApproved
                      ? 'bg-[#ECFDF3] border-[#A6F4C5]'
                      : isAuto
                      ? 'bg-[#F5F7FA] border-[#D0D5DD]'
                      : 'bg-white border-[#D0D5DD]'
                  }`}
                >
                  {/* Card Header: From -> To, Districts, Distance */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 font-semibold text-[#101828]">
                      <span>{t.from_phc_name}</span>
                      <ArrowRight className="w-4 h-4 text-[#475467]" aria-hidden="true" />
                      <span>{t.to_phc_name}</span>
                    </div>

                    {isAuto ? (
                      <button
                        type="button"
                        onClick={() => undoTransfer(t.id)}
                        className="px-2.5 py-1 rounded-[6px] text-xs font-semibold bg-white text-[#163D6E] border border-[#D0D5DD] hover:bg-gray-100 cursor-pointer transition-colors"
                        title="Click to undo this auto-dispatched transfer"
                      >
                        Auto-dispatched · Undo
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs font-semibold border ${
                          isApproved
                            ? 'bg-[#ECFDF3] text-[#067647] border-[#A6F4C5]'
                            : 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]'
                        }`}
                      >
                        {isApproved ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Approved
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            Approval required
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-[#475467] flex items-center gap-2">
                    <span>{t.from_district} → {t.to_district}</span>
                    <span>·</span>
                    <span>{t.distance_km} km</span>
                    <span>·</span>
                    <span className="font-semibold text-[#163D6E]">+{t.days_gained} days buffer gained</span>
                  </div>

                  {/* Quantity & Donor Protection */}
                  <div className="p-3 rounded-[8px] bg-white border border-[#D0D5DD] text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MedicinePictogram form={t.med_name} className="w-4 h-4 text-[#163D6E] shrink-0" />
                      <div>
                        <span className="font-semibold text-[#101828]">{t.quantity} units</span>
                        <span className="text-[#344054]"> of {t.med_name}</span>
                      </div>
                    </div>
                    <span className="text-xs text-[#475467] font-medium">
                      Donor keeps: {t.donor_buffer_remaining_days}d buffer
                    </span>
                  </div>

                  {/* Rationale and directive */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#475467] font-medium">Verified recommendation</span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedWhyTransfers((prev) => ({ ...prev, [t.id]: !prev[t.id] }))
                        }
                        className="text-xs text-[#163D6E] hover:underline font-semibold cursor-pointer"
                      >
                        {expandedWhyTransfers[t.id] ? 'Hide details' : 'Why this route?'}
                      </button>
                    </div>

                    {expandedWhyTransfers[t.id] && (
                      <div className="p-3 bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px] text-xs text-[#344054] space-y-1">
                        <p>
                          <strong>Reasoning:</strong> Rule: Under 300 units ({t.quantity} units) and under 20 km distance ({t.distance_km} km). Donor retains {t.donor_buffer_remaining_days}d buffer (&gt;14d safety floor).
                        </p>
                      </div>
                    )}

                    <p className="text-[#344054] text-xs">
                      {t.english_rationale}
                    </p>
                    <div className="p-2.5 bg-white border border-[#D0D5DD] rounded-[8px] text-xs text-[#101828]">
                      <span className="text-[#475467] block font-semibold mb-0.5">
                        Dispatch directive ({language === 'or' ? 'Odia' : 'Hindi'}):
                      </span>
                      <span lang={language === 'or' ? 'or' : 'hi'}>{t.local_order_text}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D0D5DD]">
                    {isAuto && (
                      <button
                        type="button"
                        onClick={() => undoTransfer(t.id)}
                        className="min-h-[48px] px-3.5 py-1.5 rounded-[8px] border border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F5F7FA] text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Undo2 className="w-4 h-4" aria-hidden="true" />
                        <span>Undo dispatch</span>
                      </button>
                    )}

                    {!isApproved && !isAuto && (
                      <button
                        type="button"
                        onClick={() => approveTransfer(t.id)}
                        className="min-h-[48px] px-4 py-2 rounded-[8px] bg-[#163D6E] hover:bg-[#0F2B4E] text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" aria-hidden="true" />
                        <span>Approve transfer</span>
                      </button>
                    )}

                    {isApproved && (
                      <span className="text-sm font-semibold text-[#067647] flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>Dispatched to courier</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Operational Activity Log */}
      <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-4">
        <h3 className="font-semibold text-base text-[#101828] flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#163D6E] shrink-0" aria-hidden="true" />
          <div className="flex flex-col">
            <span lang="hi" className="font-semibold text-base text-[#101828] leading-tight">गतिविधि रिकॉर्ड</span>
            <span lang="en" className="text-xs text-[#475467] font-normal leading-tight mt-0.5">Activity record</span>
          </div>
        </h3>

        <div className="divide-y divide-[#D0D5DD] max-h-56 overflow-y-auto pr-1">
          {activityLogs.map((log) => (
            <div key={log.id} className="py-3 flex items-start justify-between gap-3 text-sm">
              <div>
                <span className="font-semibold text-[#101828] block">{log.title}</span>
                <span className="text-[#344054] text-xs">{log.details}</span>
              </div>
              <span className="text-[#475467] text-xs shrink-0">
                {log.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Clinical Supply Explanation Modal */}
      {explainItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="explain-modal-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-[8px] max-w-md w-full p-6 border border-[#D0D5DD] space-y-4">
            <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#163D6E]" aria-hidden="true" />
                <h4 id="explain-modal-title" className="font-semibold text-base text-[#101828]">
                  Clinical supply rationale
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setExplainItem(null)}
                aria-label="Close dialog"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-[8px] border border-[#D0D5DD] text-[#344054] hover:bg-[#F5F7FA] cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-1 text-sm">
              <div className="font-semibold text-[#101828] flex items-center gap-1.5">
                <MedicinePictogram form={explainItem.medName} className="w-4 h-4 text-[#163D6E] shrink-0" />
                <span>{explainItem.phcName} — {explainItem.medName}</span>
              </div>
              <div className="text-[#344054]">
                Current reserve: <strong>{explainItem.days} days</strong> ({explainItem.stockQty} units remaining)
              </div>
            </div>

            <div className="p-4 bg-[#F5F7FA] border border-[#D0D5DD] rounded-[8px] text-sm space-y-2">
              <span className="font-semibold text-[#101828] block">
                Root cause analysis:
              </span>
              {explainItem.loading ? (
                <div className="flex items-center gap-2 text-[#475467] py-2">
                  <div className="w-4 h-4 border-2 border-[#163D6E] border-t-transparent rounded-full animate-spin" />
                  <span>Synthesizing consumption dynamics...</span>
                </div>
              ) : (
                <p className="text-[#344054] whitespace-pre-line leading-normal text-sm">
                  {explainItem.aiExplanation}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setExplainItem(null)}
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
