export type StateCode = 'HR' | 'OD';
export type StateName = 'Haryana' | 'Odisha';
export type AppLanguage = 'hi' | 'or' | 'en';
export type UserRole = 'phc_staff' | 'district_officer' | 'state_hub' | 'citizen';
export type TextSize = '90' | '100' | '125';

export interface PHC {
  id: string;
  name: string;
  district: string;
  block: string;
  state: StateCode;
  lat: number;
  lng: number;
  total_beds: number;
  staff_count: number;
  mo_name: string;
  contact_phone: string;
}

export interface Medicine {
  code: string;
  name: string;
  molecule: string;
  name_hi?: string;
  brand_names: string[];
  category: 'Antibiotic' | 'Analgesic' | 'Chronic' | 'Emergency' | 'IV Fluid' | 'Maternal' | 'Vector-Borne';
  unit: string;
  form?: string;
  default_daily_burn: number;
  min_stock_days: number;
  seasonal_driver?: string | null | boolean;
}

export interface StockItem {
  quantity: number;
  last_updated: string; // ISO date string
  daily_burn_rate: number;
  last_updated_days_ago?: number;
}

export interface BedStatus {
  total: number;
  occupied: number;
  available: number;
  last_updated: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'Medical Officer' | 'Staff Nurse' | 'Pharmacist' | 'ANM' | 'Lab Tech' | 'Multi-Purpose Worker';
  status: 'present' | 'absent' | 'leave';
  last_checkin?: string;
  is_mo: boolean;
}

export interface Rules {
  max_transfer_km: number;
  keep_buffer_days_at_donor: number;
  auto_dispatch_max_units: number;
  auto_dispatch_max_km: number;
  critical_threshold_days: number;
  warning_threshold_days: number;
}

export interface SampleBulletin {
  id: string;
  state: StateCode;
  title: string;
  source: string;
  date: string;
  raw_text: string;
  sample_extraction: EmergencySurgeExtraction;
}

export interface EmergencySurgeExtraction {
  disease_or_hazard: string;
  affected_districts: string[];
  blocks: string[];
  severity: number; // 1-5
  horizon_days: number;
  surge: Record<string, number>; // med_code -> multiplier (e.g. 2.5)
  extra_beds_needed: number;
  staff_needed: string[];
}

export interface ParsedReport {
  stock: Array<{
    med_code: string;
    event: 'count' | 'received' | 'issued';
    quantity: number;
    confidence: number;
    source_text: string;
  }>;
  beds: {
    available?: number;
    occupied?: number;
    confidence: number;
  };
  staff: Array<{
    role_or_name: string;
    status: 'present' | 'absent' | 'leave';
    confidence: number;
    picked_staff_id?: string;
    picked_name?: string;
    picked_role?: string;
    initial_unmatched?: boolean;
  }>;
  isFallback?: boolean;
}

export interface TransferOrder {
  id: string;
  from_phc_id: string;
  to_phc_id: string;
  from_phc_name: string;
  to_phc_name: string;
  from_district: string;
  to_district: string;
  med_code: string;
  med_name: string;
  quantity: number;
  distance_km: number;
  days_gained: number;
  donor_buffer_remaining_days: number;
  recipient_current_days?: number;
  status: 'auto_dispatched' | 'approved' | 'rejected' | 'pending';
  english_rationale: string;
  local_order_text: string;
  created_at: string;
}

export interface StaffCoverOrder {
  id: string;
  from_phc_id: string;
  to_phc_id: string;
  from_phc_name: string;
  to_phc_name: string;
  staff_name: string;
  role: string;
  distance_km: number;
  status: 'recommended' | 'deployed';
  rationale: string;
}

export interface BedReferralCard {
  id: string;
  from_phc_id: string;
  to_phc_id: string;
  from_phc_name: string;
  to_phc_name: string;
  from_district: string;
  to_district: string;
  distance_km: number;
  free_beds_at_dest: number;
  rationale: string;
}

export interface ActivityLogItem {
  id: string;
  type: 'transfer' | 'emergency' | 'report' | 'checkin' | 'profile_adopted';
  timestamp: string;
  title: string;
  details: string;
  statusText?: string;
}

export interface AppState {
  selectedRole: UserRole;
  selectedState: StateCode;
  language: AppLanguage;
  textSize: TextSize;
  highContrast: boolean;
  selectedPhcId: string;
  selectedDistrict: string; // 'ALL' or specific
  rawVsAdjusted: 'adjusted' | 'raw';
  
  // Data
  phcs: PHC[];
  medicines: Medicine[];
  stock: Record<string, Record<string, StockItem>>; // phcId -> medCode -> StockItem
  beds: Record<string, BedStatus>; // phcId -> BedStatus
  staff: Record<string, StaffMember[]>; // phcId -> StaffMember[]
  weekly_consumption_history: Record<StateCode, Record<string, number[]>>;
  rules: Rules;
  
  // Active State
  activeEmergencies: Record<StateCode, { extraction: EmergencySurgeExtraction; title: string } | null>;
  activeEmergency: EmergencySurgeExtraction | null;
  emergencyTitle: string | null;
  transfers: TransferOrder[];
  staffCovers: StaffCoverOrder[];
  bedReferrals: BedReferralCard[];
  activityLogs: ActivityLogItem[];
  odishaAdoptedFederated: boolean;
  odishaAdoptionNote?: string;
  isOfflineSimulated?: boolean;
  offlineQueue?: Array<{
    id: string;
    phcId: string;
    phcName: string;
    timestamp: string;
    report: ParsedReport;
    summary: string;
  }>;
}
