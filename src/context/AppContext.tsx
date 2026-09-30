import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  HARYANA_WEEKLY_HISTORY,
  INITIAL_BEDS,
  INITIAL_PHCS,
  INITIAL_RULES,
  INITIAL_STAFF,
  INITIAL_STOCK,
  MEDICINES,
  ODISHA_WEEKLY_HISTORY,
} from '../data/phcData';
import {
  ActivityLogItem,
  AppLanguage,
  AppState,
  BedReferralCard,
  BedStatus,
  EmergencySurgeExtraction,
  ParsedReport,
  StaffCoverOrder,
  StaffMember,
  StateCode,
  StockItem,
  TextSize,
  TransferOrder,
  UserRole,
} from '../types';

const STORAGE_KEY = 'dhara-state';

interface AppContextValue extends AppState {
  setRole: (role: UserRole) => void;
  setStateCode: (state: StateCode) => void;
  setLanguage: (lang: AppLanguage) => void;
  setTextSize: (size: TextSize) => void;
  setHighContrast: (val: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedPhcId: (phcId: string) => void;
  setSelectedDistrict: (district: string) => void;
  setRawVsAdjusted: (mode: 'adjusted' | 'raw') => void;
  applyReport: (report: ParsedReport, phcId: string) => void;
  updateBedCount: (phcId: string, deltaOccupied: number) => void;
  checkInStaff: (phcId: string, staffId: string, timeStr?: string) => void;
  activateEmergency: (extraction: EmergencySurgeExtraction, title: string, targetState?: StateCode) => void;
  clearEmergency: (targetState?: StateCode) => void;
  approveTransfer: (id: string) => void;
  undoTransfer: (id: string) => void;
  addTransfers: (newTransfers: TransferOrder[]) => void;
  deployStaffCover: (coverId: string) => void;
  adoptFederatedProfileForOdisha: (note: string) => void;
  isOfflineSimulated?: boolean;
  toggleOfflineSimulated: () => void;
  offlineQueue: Array<{
    id: string;
    phcId: string;
    phcName: string;
    timestamp: string;
    report: ParsedReport;
    summary: string;
  }>;
  queueOfflineReport: (report: ParsedReport, phcId: string, summary: string) => void;
  syncOfflineQueue: () => void;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function getInitialState(): AppState {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Verify it contains the new dataset PHC IDs (e.g. FBD-04 for PHC Mohna)
        if (
          parsed.phcs &&
          parsed.phcs.some((p: any) => p.id === 'FBD-04') &&
          parsed.medicines &&
          parsed.medicines.some((m: any) => m.code === 'PCM500') &&
          parsed.stock
        ) {
          const defaultEmergencies = { HR: null, OD: null };
          const activeEmergencies = parsed.activeEmergencies || defaultEmergencies;
          if (!parsed.activeEmergencies && parsed.activeEmergency) {
            activeEmergencies[parsed.selectedState || 'HR'] = {
              extraction: parsed.activeEmergency,
              title: parsed.emergencyTitle || 'Health Advisory',
            };
          }
          const currentState = parsed.selectedState || 'HR';
          return {
            ...parsed,
            textSize: parsed.textSize || '100',
            highContrast: Boolean(parsed.highContrast),
            activeEmergencies,
            activeEmergency: activeEmergencies[currentState]?.extraction || null,
            emergencyTitle: activeEmergencies[currentState]?.title || null,
          };
        }
      } catch (e) {
        console.error('Error parsing stored dhara-state, reverting to default:', e);
      }
    }
  }

  return {
    selectedRole: 'phc_staff',
    selectedState: 'HR',
    language: 'hi',
    textSize: '100',
    highContrast: false,
    selectedPhcId: 'FBD-04',
    selectedDistrict: 'ALL',
    rawVsAdjusted: 'adjusted',
    phcs: INITIAL_PHCS,
    medicines: MEDICINES,
    stock: INITIAL_STOCK,
    beds: INITIAL_BEDS,
    staff: INITIAL_STAFF,
    weekly_consumption_history: {
      HR: HARYANA_WEEKLY_HISTORY,
      OD: ODISHA_WEEKLY_HISTORY,
    },
    rules: INITIAL_RULES,
    activeEmergencies: {
      HR: null,
      OD: null,
    },
    activeEmergency: null,
    emergencyTitle: null,
    transfers: [],
    staffCovers: [],
    bedReferrals: [],
    activityLogs: [
      {
        id: 'init_log_1',
        type: 'report',
        timestamp: '08:45 AM',
        title: 'Morning Shift Initialised',
        details: 'Baseline stock synchronization completed across Haryana & Odisha nodes.',
      },
    ],
    odishaAdoptedFederated: false,
    odishaAdoptionNote: undefined,
    isOfflineSimulated: false,
    offlineQueue: [],
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(getInitialState);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to write to localStorage:', e);
    }
  }, [state]);

  // Synchronize document attributes for accessibility (WCAG / GIGW 3.0)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = state.language || 'en';
      document.documentElement.style.fontSize = `${state.textSize || '100'}%`;
      document.documentElement.setAttribute('data-text-size', state.textSize || '100');
      if (state.highContrast) {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
    }
  }, [state.language, state.textSize, state.highContrast]);

  const setTextSize = (textSize: TextSize) => {
    setState((prev) => ({ ...prev, textSize }));
  };

  const setHighContrast = (val: boolean | ((prev: boolean) => boolean)) => {
    setState((prev) => {
      const nextVal = typeof val === 'function' ? val(prev.highContrast) : val;
      return { ...prev, highContrast: nextVal };
    });
  };

  const setRole = (role: UserRole) => {
    setState((prev) => {
      // Language defaults based on role & state
      let lang = prev.language;
      if (role === 'district_officer' || role === 'state_hub') {
        lang = 'en';
      } else {
        lang = prev.selectedState === 'HR' ? 'hi' : 'or';
      }
      return {
        ...prev,
        selectedRole: role,
        language: lang,
      };
    });
  };

  const setStateCode = (stateCode: StateCode) => {
    setState((prev) => {
      const phcsInState = prev.phcs.filter((p) => p.state === stateCode);
      const firstPhc = phcsInState[0]?.id || prev.selectedPhcId;
      let lang = prev.language;
      if (prev.selectedRole === 'phc_staff' || prev.selectedRole === 'citizen') {
        lang = stateCode === 'HR' ? 'hi' : 'or';
      }
      const stateEmerg = prev.activeEmergencies?.[stateCode];
      return {
        ...prev,
        selectedState: stateCode,
        selectedPhcId: firstPhc,
        selectedDistrict: 'ALL',
        language: lang,
        activeEmergency: stateEmerg ? stateEmerg.extraction : null,
        emergencyTitle: stateEmerg ? stateEmerg.title : null,
      };
    });
  };

  const setLanguage = (language: AppLanguage) => {
    setState((prev) => ({ ...prev, language }));
  };

  const setSelectedPhcId = (selectedPhcId: string) => {
    setState((prev) => ({ ...prev, selectedPhcId }));
  };

  const setSelectedDistrict = (selectedDistrict: string) => {
    setState((prev) => ({ ...prev, selectedDistrict }));
  };

  const setRawVsAdjusted = (rawVsAdjusted: 'adjusted' | 'raw') => {
    setState((prev) => ({ ...prev, rawVsAdjusted }));
  };

  const applyReport = (report: ParsedReport, phcId: string) => {
    setState((prev) => {
      const now = new Date().toISOString();
      const phcStock = { ...(prev.stock[phcId] || {}) };

      // Set last_updated = today for that PHC's stock so the row is no longer stale
      Object.keys(phcStock).forEach((mCode) => {
        phcStock[mCode] = {
          ...phcStock[mCode],
          last_updated: now,
          last_updated_days_ago: 0,
        };
      });

      // Update specific medicines from report
      report.stock.forEach((item) => {
        const existing = phcStock[item.med_code] || {
          quantity: 0,
          daily_burn_rate: 15,
          last_updated: now,
          last_updated_days_ago: 0,
        };

        let newQty = existing.quantity;
        if (item.event === 'count') {
          newQty = item.quantity;
        } else if (item.event === 'received') {
          newQty += item.quantity;
        } else if (item.event === 'issued') {
          newQty = Math.max(0, newQty - item.quantity);
        }

        phcStock[item.med_code] = {
          ...existing,
          quantity: newQty,
          last_updated: now,
          last_updated_days_ago: 0,
        };
      });

      // Update beds: set last_updated = today
      const existingBeds = prev.beds[phcId] || {
        total: 10,
        occupied: 0,
        available: 10,
        last_updated: now,
      };
      let updatedBeds: BedStatus = { ...existingBeds, last_updated: now };
      if (report.beds.occupied !== undefined) {
        const occ = Math.max(0, Math.min(existingBeds.total, report.beds.occupied));
        updatedBeds = {
          ...updatedBeds,
          occupied: occ,
          available: Math.max(0, existingBeds.total - occ),
          last_updated: now,
        };
      } else if (report.beds.available !== undefined) {
        const avail = Math.max(0, Math.min(existingBeds.total, report.beds.available));
        updatedBeds = {
          ...updatedBeds,
          available: avail,
          occupied: Math.max(0, existingBeds.total - avail),
          last_updated: now,
        };
      }

      // Update staff: set last_updated/checkin = today and never drop parsed line silently
      const phcStaffList = [...(prev.staff[phcId] || [])];
      const checkinTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      report.staff.forEach((repStaff) => {
        // Priority 1: Picked staff member ID
        let found = repStaff.picked_staff_id
          ? phcStaffList.find((s) => s.id === repStaff.picked_staff_id)
          : undefined;

        // Priority 2: Name or role match
        if (!found) {
          const queryName = repStaff.role_or_name.toLowerCase().trim();
          found = phcStaffList.find(
            (s) =>
              s.name.toLowerCase() === queryName ||
              s.name.toLowerCase().includes(queryName) ||
              queryName.includes(s.name.toLowerCase()) ||
              s.role.toLowerCase() === queryName ||
              s.role.toLowerCase().includes(queryName)
          );
        }

        if (found) {
          found.status = repStaff.status;
          found.last_checkin = repStaff.status === 'present' ? checkinTime : undefined;
        } else {
          // Never drop a parsed line silently!
          const isDoc = repStaff.role_or_name.toLowerCase().includes('dr') ||
                        repStaff.role_or_name.toLowerCase().includes('doctor');
          phcStaffList.push({
            id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: repStaff.role_or_name,
            role: isDoc ? 'Medical Officer' : 'Staff Nurse',
            status: repStaff.status,
            is_mo: isDoc,
            last_checkin: repStaff.status === 'present' ? checkinTime : undefined,
          });
        }
      });

      const phcObj = prev.phcs.find((p) => p.id === phcId);
      const logItem: ActivityLogItem = {
        id: `rep_${Date.now()}`,
        type: 'report',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        title: `Report Processed: ${phcObj?.name || phcId}`,
        details: `Updated stock (marked fresh today), ${
          report.beds.occupied !== undefined || report.beds.available !== undefined
            ? 'bed count'
            : 'no bed changes'
        }, and ${report.staff.length} staff attendance records.`,
      };

      return {
        ...prev,
        stock: { ...prev.stock, [phcId]: phcStock },
        beds: { ...prev.beds, [phcId]: updatedBeds },
        staff: { ...prev.staff, [phcId]: phcStaffList },
        activityLogs: [logItem, ...prev.activityLogs],
      };
    });
  };

  const updateBedCount = (phcId: string, deltaOccupied: number) => {
    setState((prev) => {
      const cur = prev.beds[phcId];
      if (!cur) return prev;
      const newOccupied = Math.max(0, Math.min(cur.total, cur.occupied + deltaOccupied));
      const newAvailable = Math.max(0, cur.total - newOccupied);

      return {
        ...prev,
        beds: {
          ...prev.beds,
          [phcId]: {
            ...cur,
            occupied: newOccupied,
            available: newAvailable,
            last_updated: new Date().toISOString(),
          },
        },
      };
    });
  };

  const checkInStaff = (phcId: string, staffId: string, timeStr?: string) => {
    setState((prev) => {
      const list = [...(prev.staff[phcId] || [])];
      const member = list.find((s) => s.id === staffId);
      if (!member) return prev;

      member.status = 'present';
      member.last_checkin =
        timeStr ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const phcObj = prev.phcs.find((p) => p.id === phcId);
      const logItem: ActivityLogItem = {
        id: `chk_${Date.now()}`,
        type: 'checkin',
        timestamp: member.last_checkin,
        title: `Staff Geo-Verified Check-In`,
        details: `${member.name} (${member.role}) checked in at ${phcObj?.name}. Geofence within 300m verified.`,
      };

      return {
        ...prev,
        staff: { ...prev.staff, [phcId]: list },
        activityLogs: [logItem, ...prev.activityLogs],
      };
    });
  };

  const activateEmergency = (
    extraction: EmergencySurgeExtraction,
    title: string,
    targetState?: StateCode
  ) => {
    setState((prev) => {
      const stateCode = targetState || prev.selectedState;
      const logItem: ActivityLogItem = {
        id: `emerg_${Date.now()}`,
        type: 'emergency',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        title: `Emergency Activated (${stateCode === 'HR' ? 'Haryana' : 'Odisha'}): ${title}`,
        details: `Surge factors engaged across ${extraction.affected_districts.join(', ')}. Demand models updated.`,
      };

      const updatedEmergencies = {
        ...prev.activeEmergencies,
        [stateCode]: { extraction, title },
      };

      return {
        ...prev,
        activeEmergencies: updatedEmergencies,
        activeEmergency: stateCode === prev.selectedState ? extraction : prev.activeEmergency,
        emergencyTitle: stateCode === prev.selectedState ? title : prev.emergencyTitle,
        activityLogs: [logItem, ...prev.activityLogs],
      };
    });
  };

  const clearEmergency = (targetState?: StateCode) => {
    setState((prev) => {
      const stateCode = targetState || prev.selectedState;
      const updatedEmergencies = {
        ...prev.activeEmergencies,
        [stateCode]: null,
      };
      return {
        ...prev,
        activeEmergencies: updatedEmergencies,
        activeEmergency: stateCode === prev.selectedState ? null : prev.activeEmergency,
        emergencyTitle: stateCode === prev.selectedState ? null : prev.emergencyTitle,
      };
    });
  };

  const addTransfers = (newTransfers: TransferOrder[]) => {
    setState((prev) => {
      const combined = [...prev.transfers];
      for (const t of newTransfers) {
        if (!combined.some((ex) => ex.id === t.id)) {
          combined.unshift(t);
        }
      }
      return { ...prev, transfers: combined };
    });
  };

  const approveTransfer = (id: string) => {
    setState((prev) => {
      const transfer = prev.transfers.find((t) => t.id === id);
      if (!transfer) return prev;

      const fromStock = prev.stock[transfer.from_phc_id]?.[transfer.med_code];
      const toStock = prev.stock[transfer.to_phc_id]?.[transfer.med_code];

      const newFromQty = Math.max(0, (fromStock?.quantity || 0) - transfer.quantity);
      const newToQty = (toStock?.quantity || 0) + transfer.quantity;

      const updatedTransfers = prev.transfers.map((t) =>
        t.id === id ? { ...t, status: 'approved' as const } : t
      );

      const logItem: ActivityLogItem = {
        id: `tr_${Date.now()}`,
        type: 'transfer',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        title: `Transfer Approved: ${transfer.med_name}`,
        details: `Dispatched ${transfer.quantity} units from ${transfer.from_phc_name} to ${transfer.to_phc_name} (+${transfer.days_gained} days buffer).`,
      };

      return {
        ...prev,
        transfers: updatedTransfers,
        stock: {
          ...prev.stock,
          [transfer.from_phc_id]: {
            ...prev.stock[transfer.from_phc_id],
            [transfer.med_code]: {
              ...fromStock,
              quantity: newFromQty,
              last_updated: new Date().toISOString(),
              daily_burn_rate: fromStock?.daily_burn_rate || 20,
            },
          },
          [transfer.to_phc_id]: {
            ...prev.stock[transfer.to_phc_id],
            [transfer.med_code]: {
              ...toStock,
              quantity: newToQty,
              last_updated: new Date().toISOString(),
              daily_burn_rate: toStock?.daily_burn_rate || 20,
            },
          },
        },
        activityLogs: [logItem, ...prev.activityLogs],
      };
    });
  };

  const undoTransfer = (id: string) => {
    setState((prev) => {
      const transfer = prev.transfers.find((t) => t.id === id);
      if (!transfer) return prev;

      const fromStock = prev.stock[transfer.from_phc_id]?.[transfer.med_code];
      const toStock = prev.stock[transfer.to_phc_id]?.[transfer.med_code];

      // Revert amounts
      const newFromQty = (fromStock?.quantity || 0) + transfer.quantity;
      const newToQty = Math.max(0, (toStock?.quantity || 0) - transfer.quantity);

      const updatedTransfers = prev.transfers.filter((t) => t.id !== id);

      const logItem: ActivityLogItem = {
        id: `undo_${Date.now()}`,
        type: 'transfer',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        title: `Auto-Dispatch Undone`,
        details: `Reverted transfer of ${transfer.quantity} units of ${transfer.med_name} back to ${transfer.from_phc_name}.`,
      };

      return {
        ...prev,
        transfers: updatedTransfers,
        stock: {
          ...prev.stock,
          [transfer.from_phc_id]: {
            ...prev.stock[transfer.from_phc_id],
            [transfer.med_code]: {
              ...fromStock,
              quantity: newFromQty,
              last_updated: new Date().toISOString(),
              daily_burn_rate: fromStock?.daily_burn_rate || 20,
            },
          },
          [transfer.to_phc_id]: {
            ...prev.stock[transfer.to_phc_id],
            [transfer.med_code]: {
              ...toStock,
              quantity: newToQty,
              last_updated: new Date().toISOString(),
              daily_burn_rate: toStock?.daily_burn_rate || 20,
            },
          },
        },
        activityLogs: [logItem, ...prev.activityLogs],
      };
    });
  };

  const deployStaffCover = (coverId: string) => {
    setState((prev) => {
      const updated = prev.staffCovers.map((sc) =>
        sc.id === coverId ? { ...sc, status: 'deployed' as const } : sc
      );
      return { ...prev, staffCovers: updated };
    });
  };

  const adoptFederatedProfileForOdisha = (note: string) => {
    setState((prev) => {
      const logItem: ActivityLogItem = {
        id: `adopt_${Date.now()}`,
        type: 'profile_adopted',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        title: `Odisha Adopted Federated Model Profile`,
        details: `Cross-state predictive uplift adopted. Baseline consumption models calibrated.`,
      };

      return {
        ...prev,
        odishaAdoptedFederated: true,
        odishaAdoptionNote: note,
        activityLogs: [logItem, ...prev.activityLogs],
      };
    });
  };

  const toggleOfflineSimulated = () => {
    setState((prev) => {
      const nextVal = !prev.isOfflineSimulated;
      return {
        ...prev,
        isOfflineSimulated: nextVal,
        activityLogs: [
          {
            id: `net_${Date.now()}`,
            type: 'report' as const,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            title: nextVal ? 'Offline Mode Simulated' : 'Network Connection Restored',
            details: nextVal
              ? 'Device disconnected from internet simulation. Reports will save on phone storage.'
              : 'Device connected. Queued offline reports can now be synced.',
          },
          ...prev.activityLogs,
        ],
      };
    });
  };

  const queueOfflineReport = (report: ParsedReport, phcId: string, summary: string) => {
    const phcObj = state.phcs.find((p) => p.id === phcId);
    const item = {
      id: `off_${Date.now()}`,
      phcId,
      phcName: phcObj ? phcObj.name : phcId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      report,
      summary,
    };
    setState((prev) => ({
      ...prev,
      offlineQueue: [...(prev.offlineQueue || []), item],
      activityLogs: [
        {
          id: `off_log_${Date.now()}`,
          type: 'report' as const,
          timestamp: item.timestamp,
          title: 'Report Saved Locally on Phone',
          details: `${item.phcName}: ${summary}. Queued for auto-dispatch when network returns.`,
        },
        ...prev.activityLogs,
      ],
    }));
  };

  const syncOfflineQueue = () => {
    setState((prev) => {
      const queue = prev.offlineQueue || [];
      if (queue.length === 0) return prev;

      let updatedStock = { ...prev.stock };
      let updatedBeds = { ...prev.beds };
      let updatedStaff = { ...prev.staff };
      const now = new Date().toISOString();

      queue.forEach((q) => {
        const phcId = q.phcId;
        const phcStock = { ...(updatedStock[phcId] || {}) };
        Object.keys(phcStock).forEach((mCode) => {
          phcStock[mCode] = {
            ...phcStock[mCode],
            last_updated: now,
            last_updated_days_ago: 0,
          };
        });
        q.report.stock.forEach((item) => {
          const existing = phcStock[item.med_code] || {
            quantity: 0,
            daily_burn_rate: 15,
            last_updated: now,
            last_updated_days_ago: 0,
          };
          let newQty = existing.quantity;
          if (item.event === 'count') newQty = item.quantity;
          else if (item.event === 'received') newQty += item.quantity;
          else if (item.event === 'issued') newQty = Math.max(0, newQty - item.quantity);

          phcStock[item.med_code] = {
            ...existing,
            quantity: newQty,
            last_updated: now,
            last_updated_days_ago: 0,
          };
        });
        updatedStock[phcId] = phcStock;

        const existingBeds = updatedBeds[phcId] || { total: 10, occupied: 0, available: 10, last_updated: now };
        let b = { ...existingBeds, last_updated: now };
        if (q.report.beds.occupied !== undefined) {
          const occ = Math.max(0, Math.min(existingBeds.total, q.report.beds.occupied));
          b = { ...b, occupied: occ, available: Math.max(0, existingBeds.total - occ), last_updated: now };
        } else if (q.report.beds.available !== undefined) {
          const avail = Math.max(0, Math.min(existingBeds.total, q.report.beds.available));
          b = { ...b, available: avail, occupied: Math.max(0, existingBeds.total - avail), last_updated: now };
        }
        updatedBeds[phcId] = b;

        const phcStaffList = [...(updatedStaff[phcId] || [])];
        q.report.staff.forEach((repStaff) => {
          const matchedIdx = phcStaffList.findIndex(
            (s) => (repStaff.picked_staff_id && s.id === repStaff.picked_staff_id) || s.name.toLowerCase().includes(repStaff.role_or_name.toLowerCase())
          );
          if (matchedIdx !== -1) {
            phcStaffList[matchedIdx] = {
              ...phcStaffList[matchedIdx],
              status: repStaff.status,
              last_checkin: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
          }
        });
        updatedStaff[phcId] = phcStaffList;
      });

      const syncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        ...prev,
        stock: updatedStock,
        beds: updatedBeds,
        staff: updatedStaff,
        offlineQueue: [],
        activityLogs: [
          {
            id: `sync_${Date.now()}`,
            type: 'report' as const,
            timestamp: syncTime,
            title: 'Offline Queue Synchronized',
            details: `Successfully uploaded ${queue.length} offline health facility reports to state database.`,
          },
          ...prev.activityLogs,
        ],
      };
    });
  };

  const resetDemo = () => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = {
      selectedRole: 'phc_staff' as UserRole,
      selectedState: 'HR' as StateCode,
      language: 'hi' as AppLanguage,
      textSize: '100' as TextSize,
      highContrast: false,
      selectedPhcId: 'FBD-04',
      selectedDistrict: 'ALL',
      rawVsAdjusted: 'adjusted' as const,
      phcs: INITIAL_PHCS,
      medicines: MEDICINES,
      stock: INITIAL_STOCK,
      beds: INITIAL_BEDS,
      staff: INITIAL_STAFF,
      weekly_consumption_history: {
        HR: HARYANA_WEEKLY_HISTORY,
        OD: ODISHA_WEEKLY_HISTORY,
      },
      rules: INITIAL_RULES,
      activeEmergencies: {
        HR: null,
        OD: null,
      },
      activeEmergency: null,
      emergencyTitle: null,
      transfers: [],
      staffCovers: [],
      bedReferrals: [],
      activityLogs: [
        {
          id: `reset_${Date.now()}`,
          type: 'report' as const,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          title: 'Demo Environment Reset',
          details: 'Restored baseline synthetic data for Haryana & Odisha Primary Health Centres.',
        },
      ],
      odishaAdoptedFederated: false,
      odishaAdoptionNote: undefined,
      isOfflineSimulated: false,
      offlineQueue: [],
    };
    setState(fresh);
  };

  return (
    <AppContext.Provider
      value={{
        ...state,
        setRole,
        setStateCode,
        setLanguage,
        setTextSize,
        setHighContrast,
        setSelectedPhcId,
        setSelectedDistrict,
        setRawVsAdjusted,
        applyReport,
        updateBedCount,
        checkInStaff,
        activateEmergency,
        clearEmergency,
        approveTransfer,
        undoTransfer,
        addTransfers,
        deployStaffCover,
        adoptFederatedProfileForOdisha,
        toggleOfflineSimulated,
        queueOfflineReport,
        syncOfflineQueue,
        resetDemo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
