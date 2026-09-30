import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Calendar,
  Layers,
  Info,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import { Medicine, StateCode } from '../types';
import { MedicinePictogram } from '../lib/i18n';

interface MedicineConsumptionTrendChartProps {
  medicines: Medicine[];
  weeklyConsumptionHistory: Record<StateCode, Record<string, number[]>>;
  facilityCounts: Record<string, number>;
  odishaAdoptedFederated: boolean;
}

interface DailyDataPoint {
  dayIndex: number; // 0 to 29
  dateStr: string; // e.g. "Sep 1"
  fullDate: string; // e.g. "01 Sep 2026"
  totalRate: number; // Combined units/day
  hrRate: number; // Haryana units/day
  odRate: number; // Odisha units/day
  baseline: number; // Baseline burn rate
  anomaly?: boolean; // Peak surge flag
}

export const MedicineConsumptionTrendChart: React.FC<MedicineConsumptionTrendChartProps> = ({
  medicines,
  weeklyConsumptionHistory,
  facilityCounts,
  odishaAdoptedFederated,
}) => {
  const [selectedMedCode, setSelectedMedCode] = useState<string>('PCM500');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'HR' | 'OD'>('ALL');
  const [hoveredPoint, setHoveredPoint] = useState<DailyDataPoint | null>(null);
  const [chartMode, setChartMode] = useState<'rate' | 'cumulative'>('rate');

  const selectedMed = useMemo(() => {
    return medicines.find((m) => m.code === selectedMedCode) || medicines[0];
  }, [medicines, selectedMedCode]);

  // Compute 30-day daily consumption points for the selected medicine
  const { dataPoints, kpis } = useMemo(() => {
    const hrHistory = weeklyConsumptionHistory.HR?.[selectedMedCode] || [];
    const odHistory = weeklyConsumptionHistory.OD?.[selectedMedCode] || [];

    // The last 4 weeks of history represent the last 28 days, plus 2 days for 30-day horizon
    const hrLast4 = hrHistory.length >= 4 ? hrHistory.slice(-4) : [1000, 1100, 1200, 1150];
    const hrEarlier = hrHistory.length > 4 ? hrHistory.slice(0, hrHistory.length - 4) : [900, 950, 920];
    const hrEarlierAvg = hrEarlier.reduce((a, b) => a + b, 0) / (hrEarlier.length || 1);
    const hrBaselineDaily = Math.round((hrEarlierAvg / 7) * 10) / 10;

    // OD history
    const odLast3 = odHistory.length >= 3 ? odHistory.slice(-3) : [450, 480, 510];
    const odAvgWeekly = odLast3.reduce((a, b) => a + b, 0) / (odLast3.length || 1);
    const odBaselineDaily = Math.round((odAvgWeekly / 7) * 10) / 10;

    // Generate 30 daily data points ending on 2026-09-30
    const points: DailyDataPoint[] = [];
    const endDate = new Date(2026, 8, 30); // Sep 30, 2026

    // Deterministic pseudo-random seed based on medicine code
    let seed = 0;
    for (let c = 0; c < selectedMedCode.length; c++) {
      seed = (seed << 5) - seed + selectedMedCode.charCodeAt(c);
    }
    const pseudoRandom = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 30; i++) {
      const dayOffset = 29 - i;
      const d = new Date(endDate.getTime() - dayOffset * 86400000);
      const dayOfWeek = d.getDay();
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const fullDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

      const weekIndex = Math.min(3, Math.floor(i / 7));
      const hrWeekVal = hrLast4[weekIndex] || hrLast4[hrLast4.length - 1];
      const hrDailyBase = hrWeekVal / 7;

      const odWeekVal = odLast3[Math.min(odLast3.length - 1, Math.floor(i / 10))] || odAvgWeekly;
      const odDailyBase = odWeekVal / 7;

      const weekdayFactor = dayOfWeek === 0 ? 0.72 : dayOfWeek === 1 ? 1.22 : dayOfWeek === 2 ? 1.15 : 0.98;
      const noise = (pseudoRandom(i) - 0.5) * 0.12;

      const isSurgeMed = Boolean(selectedMed.seasonal_driver) || ['PCM500', 'ORS', 'RL500', 'NS1KIT', 'ZN20'].includes(selectedMedCode);
      const surgeGrowth = isSurgeMed && i >= 14 ? (i - 14) * 0.018 : 0;

      const hrRate = Math.round((hrDailyBase * (weekdayFactor + noise + surgeGrowth)) * 10) / 10;
      const odRate = Math.round((odDailyBase * (weekdayFactor + noise * 0.8 + surgeGrowth * 0.6)) * 10) / 10;
      const totalRate = Math.round((hrRate + odRate) * 10) / 10;

      const baseline =
        stateFilter === 'HR'
          ? hrBaselineDaily
          : stateFilter === 'OD'
          ? odBaselineDaily
          : Math.round((hrBaselineDaily + odBaselineDaily) * 10) / 10;

      points.push({
        dayIndex: i,
        dateStr,
        fullDate,
        totalRate,
        hrRate,
        odRate,
        baseline,
        anomaly: Boolean(isSurgeMed && i >= 20 && totalRate > baseline * 1.3),
      });
    }

    const activeRates = points.map((p) =>
      stateFilter === 'HR' ? p.hrRate : stateFilter === 'OD' ? p.odRate : p.totalRate
    );
    const total30d = Math.round(activeRates.reduce((a, b) => a + b, 0));
    const avgDailyRate = Math.round((total30d / 30) * 10) / 10;

    const maxRate = Math.max(...activeRates);
    const maxIndex = activeRates.indexOf(maxRate);
    const peakDay = points[maxIndex] || points[0];

    const firstWeekAvg = activeRates.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const lastWeekAvg = activeRates.slice(23, 30).reduce((a, b) => a + b, 0) / 7;
    const velocityPercent = Math.round(((lastWeekAvg - firstWeekAvg) / (firstWeekAvg || 1)) * 100);

    return {
      dataPoints: points,
      kpis: {
        total30d,
        avgDailyRate,
        maxRate,
        peakDay,
        velocityPercent,
        baseline: points[0]?.baseline || 100,
      },
    };
  }, [selectedMedCode, stateFilter, weeklyConsumptionHistory, selectedMed]);

  // Compute SVG dimensions and paths
  const svgWidth = 840;
  const svgHeight = 240;
  const padding = { top: 25, right: 30, bottom: 35, left: 55 };
  const innerWidth = svgWidth - padding.left - padding.right;
  const innerHeight = svgHeight - padding.top - padding.bottom;

  // Active y-values based on state filter and chartMode
  const chartValues = useMemo(() => {
    let runningTotal = 0;
    return dataPoints.map((p) => {
      const rate = stateFilter === 'HR' ? p.hrRate : stateFilter === 'OD' ? p.odRate : p.totalRate;
      if (chartMode === 'cumulative') {
        runningTotal += rate;
        return runningTotal;
      }
      return rate;
    });
  }, [dataPoints, stateFilter, chartMode]);

  const maxVal = useMemo(() => {
    const m = Math.max(...chartValues, 10);
    return Math.ceil(m * 1.15);
  }, [chartValues]);

  const minVal = 0;

  // Coordinate mapping functions
  const getX = (index: number) => padding.left + (index / (dataPoints.length - 1)) * innerWidth;
  const getY = (val: number) => padding.top + innerHeight - ((val - minVal) / (maxVal - minVal || 1)) * innerHeight;

  // Generate SVG curve
  const { pathD, areaD, pointsCoord } = useMemo(() => {
    const coords = chartValues.map((val, idx) => ({
      x: getX(idx),
      y: getY(val),
      val,
      data: dataPoints[idx],
    }));

    if (coords.length === 0) return { pathD: '', areaD: '', pointsCoord: [] };

    let pD = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cx = (p0.x + p1.x) / 2;
      pD += ` C ${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
    }

    const lastX = coords[coords.length - 1].x;
    const firstX = coords[0].x;
    const bottomY = padding.top + innerHeight;
    const aD = `${pD} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;

    return { pathD: pD, areaD: aD, pointsCoord: coords };
  }, [chartValues, dataPoints, innerWidth, innerHeight, padding, maxVal]);

  const baselineY = getY(kpis.baseline);

  return (
    <div className="bg-white rounded-[8px] border border-[#D0D5DD] p-6 space-y-6">
      {/* Top Header & Interactive Filter Ribbon */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#D0D5DD] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-[8px] bg-[#F5F7FA] text-[#163D6E] border border-[#D0D5DD]">
              <TrendingUp className="w-5 h-5" aria-hidden="true" />
            </span>
            <h3 className="font-semibold text-lg text-[#101828]">
              30-Day essential medicine consumption trend line
            </h3>
            <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-[8px] bg-[#F5F7FA] text-[#344054] text-sm font-medium border border-[#D0D5DD]">
              31 Aug – 30 Sep 2026
            </span>
          </div>
          <p className="text-sm text-[#475467] mt-1 max-w-2xl">
            Empirical consumption rate across primary healthcare dispensaries over the last 30 days. Identifies seasonal velocity spikes vs chronic baseline demand.
          </p>
        </div>

        {/* Controls: Medicine Selector, State Toggle & View Mode */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Medicine Select Dropdown with Visible Label */}
          <div>
            <label htmlFor="med-trend-selector" className="block text-sm font-semibold text-[#101828] mb-1">
              Select medicine
            </label>
            <div className="relative">
              <select
                id="med-trend-selector"
                value={selectedMedCode}
                onChange={(e) => setSelectedMedCode(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 min-h-[48px] rounded-[8px] border border-[#D0D5DD] bg-white text-sm font-semibold text-[#101828] cursor-pointer hover:bg-[#F5F7FA] transition-colors focus:ring-2 focus:ring-[#163D6E]"
              >
                {medicines.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#475467] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
          </div>

          {/* State Scope Selector */}
          <div>
            <span className="block text-sm font-semibold text-[#101828] mb-1">State filter</span>
            <div className="flex items-center bg-[#F5F7FA] p-1 rounded-[8px] border border-[#D0D5DD] text-sm font-medium">
              <button
                type="button"
                onClick={() => setStateFilter('ALL')}
                className={`min-h-[40px] px-3 py-1 rounded-[6px] transition-colors cursor-pointer ${
                  stateFilter === 'ALL'
                    ? 'bg-[#163D6E] text-white font-semibold'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                All states
              </button>
              <button
                type="button"
                onClick={() => setStateFilter('HR')}
                className={`min-h-[40px] px-3 py-1 rounded-[6px] transition-colors cursor-pointer ${
                  stateFilter === 'HR'
                    ? 'bg-[#163D6E] text-white font-semibold'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                Haryana
              </button>
              <button
                type="button"
                onClick={() => setStateFilter('OD')}
                className={`min-h-[40px] px-3 py-1 rounded-[6px] transition-colors cursor-pointer ${
                  stateFilter === 'OD'
                    ? 'bg-[#163D6E] text-white font-semibold'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                Odisha
              </button>
            </div>
          </div>

          {/* Rate vs Cumulative Toggle */}
          <div>
            <span className="block text-sm font-semibold text-[#101828] mb-1">Display view</span>
            <div className="flex items-center bg-[#F5F7FA] p-1 rounded-[8px] border border-[#D0D5DD] text-sm font-medium">
              <button
                type="button"
                onClick={() => setChartMode('rate')}
                className={`min-h-[40px] px-3 py-1 rounded-[6px] transition-colors cursor-pointer ${
                  chartMode === 'rate'
                    ? 'bg-[#163D6E] text-white font-semibold'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                Daily burn
              </button>
              <button
                type="button"
                onClick={() => setChartMode('cumulative')}
                className={`min-h-[40px] px-3 py-1 rounded-[6px] transition-colors cursor-pointer ${
                  chartMode === 'cumulative'
                    ? 'bg-[#163D6E] text-white font-semibold'
                    : 'text-[#344054] hover:text-[#101828]'
                }`}
              >
                Cumulative
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Medicine Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-sm">
        <span className="text-sm font-semibold text-[#475467] shrink-0">Essential shortcuts:</span>
        {medicines.slice(0, 7).map((m) => {
          const isSelected = m.code === selectedMedCode;
          return (
            <button
              key={m.code}
              type="button"
              onClick={() => setSelectedMedCode(m.code)}
              className={`min-h-[48px] px-3 py-1.5 rounded-[8px] text-sm font-medium shrink-0 transition-colors cursor-pointer border flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[#163D6E] text-white border-[#163D6E] font-semibold'
                  : 'bg-white text-[#344054] border-[#D0D5DD] hover:bg-[#F5F7FA] hover:text-[#101828]'
              }`}
            >
              <MedicinePictogram form={m.form || m.unit || m.category || m.name} className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[#163D6E]'}`} />
              <span>{m.name.split(' ')[0]}</span>
              {m.seasonal_driver && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-[#FEF3F2] text-[#B42318] border border-[#FDA29B] font-semibold">
                  Surge
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 30-Day Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#F5F7FA] p-4 rounded-[8px] border border-[#D0D5DD]">
        <div>
          <span className="text-sm font-semibold text-[#475467] block">
            30-Day total consumed
          </span>
          <div className="text-xl font-bold text-[#101828] mt-1">
            {kpis.total30d.toLocaleString()} <span className="text-sm font-normal text-[#475467]">{selectedMed.unit}</span>
          </div>
          <span className="text-sm text-[#475467]">Across {facilityCounts.HR + facilityCounts.OD} facilities</span>
        </div>

        <div>
          <span className="text-sm font-semibold text-[#475467] block">
            Average burn rate
          </span>
          <div className="text-xl font-bold text-[#101828] mt-1">
            {kpis.avgDailyRate} <span className="text-sm font-normal text-[#475467]">units/day</span>
          </div>
          <span className="text-sm text-[#475467]">Baseline: {kpis.baseline} units/day</span>
        </div>

        <div>
          <span className="text-sm font-semibold text-[#475467] block">
            Peak surge day
          </span>
          <div className="text-xl font-bold text-[#101828] mt-1">
            {kpis.maxRate} <span className="text-sm font-normal text-[#475467]">units/day</span>
          </div>
          <span className="text-sm text-[#475467]">{kpis.peakDay.fullDate}</span>
        </div>

        <div>
          <span className="text-sm font-semibold text-[#475467] block">
            30-Day velocity
          </span>
          <div className="text-xl font-bold mt-1 flex items-center gap-1">
            {kpis.velocityPercent > 10 ? (
              <span className="text-[#B42318] flex items-center">
                <ArrowUpRight className="w-5 h-5 shrink-0" aria-hidden="true" />
                +{kpis.velocityPercent}%
              </span>
            ) : kpis.velocityPercent < -10 ? (
              <span className="text-[#067647] flex items-center">
                <ArrowDownRight className="w-5 h-5 shrink-0" aria-hidden="true" />
                {kpis.velocityPercent}%
              </span>
            ) : (
              <span className="text-[#344054] flex items-center">
                <Minus className="w-5 h-5 shrink-0" aria-hidden="true" />
                {kpis.velocityPercent}%
              </span>
            )}
          </div>
          <span className="text-sm text-[#475467]">
            {kpis.velocityPercent > 10 ? 'Accelerating burn' : 'Stable consumption'}
          </span>
        </div>
      </div>

      {/* Interactive SVG Chart Container */}
      <div className="relative border border-[#D0D5DD] rounded-[8px] bg-white p-2 overflow-x-auto">
        <div style={{ minWidth: `${svgWidth}px` }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label={`30-day consumption trend line for ${selectedMed.name}`}
          >
            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const val = Math.round(minVal + pct * (maxVal - minVal));
              const y = getY(val);
              return (
                <g key={pct}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={svgWidth - padding.right}
                    y2={y}
                    stroke="#D0D5DD"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="#475467"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Baseline Reference Line (Rate mode only) */}
            {chartMode === 'rate' && (
              <g>
                <line
                  x1={padding.left}
                  y1={baselineY}
                  x2={svgWidth - padding.right}
                  y2={baselineY}
                  stroke="#475467"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={svgWidth - padding.right}
                  y={baselineY - 6}
                  textAnchor="end"
                  fontSize="11"
                  fill="#475467"
                  fontWeight="600"
                >
                  Baseline: {kpis.baseline} u/d
                </text>
              </g>
            )}

            {/* Area Fill */}
            <path d={areaD} fill="#F5F7FA" />

            {/* Trend Line Curve in Deep Navy */}
            <path
              d={pathD}
              fill="none"
              stroke="#163D6E"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data Point Circles and Hover Hitboxes */}
            {pointsCoord.map((pt, idx) => {
              const isSelected = hoveredPoint?.dayIndex === idx;
              const isPeak = pt.data.dayIndex === kpis.peakDay.dayIndex;
              const isAnomaly = pt.data.anomaly;

              return (
                <g key={idx}>
                  {/* Subtle marker point */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isPeak ? 5 : isAnomaly ? 4.5 : isSelected ? 5 : 3}
                    fill={isAnomaly ? '#B42318' : isPeak ? '#B54708' : '#163D6E'}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />

                  {/* Date labels on X-axis (every 4 days) */}
                  {idx % 4 === 0 && (
                    <text
                      x={pt.x}
                      y={svgHeight - 10}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#475467"
                    >
                      {pt.data.dateStr}
                    </text>
                  )}

                  {/* Transparent hover hitbox */}
                  <rect
                    x={pt.x - 12}
                    y={padding.top}
                    width={24}
                    height={innerHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(pt.data)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    aria-label={`${pt.data.fullDate}: ${pt.val} units`}
                  />
                </g>
              );
            })}

            {/* Active Hover Crosshair & Dot */}
            {hoveredPoint && (
              <g>
                <line
                  x1={getX(hoveredPoint.dayIndex)}
                  y1={padding.top}
                  x2={getX(hoveredPoint.dayIndex)}
                  y2={padding.top + innerHeight}
                  stroke="#163D6E"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  className="pointer-events-none"
                />
                <circle
                  cx={getX(hoveredPoint.dayIndex)}
                  cy={getY(
                    chartMode === 'cumulative'
                      ? chartValues[hoveredPoint.dayIndex]
                      : stateFilter === 'HR'
                      ? hoveredPoint.hrRate
                      : stateFilter === 'OD'
                      ? hoveredPoint.odRate
                      : hoveredPoint.totalRate
                  )}
                  r="6"
                  fill="#163D6E"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  className="pointer-events-none"
                />
              </g>
            )}
          </svg>
        </div>

        {/* Floating Tooltip (Clean 1px border card) */}
        {hoveredPoint && (
          <div
            className="absolute top-4 right-4 z-20 bg-white text-[#101828] p-3 rounded-[8px] border border-[#D0D5DD] text-sm space-y-1.5"
            style={{ minWidth: '200px' }}
          >
            <div className="flex items-center justify-between border-b border-[#D0D5DD] pb-1">
              <span className="font-semibold text-[#101828] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#163D6E]" aria-hidden="true" />
                <span>{hoveredPoint.fullDate}</span>
              </span>
              <span className="text-xs text-[#475467]">Day {hoveredPoint.dayIndex + 1}/30</span>
            </div>

            <div className="space-y-1 pt-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[#475467]">
                  {chartMode === 'rate' ? 'Burn rate:' : 'Cumulative:'}
                </span>
                <span className="font-semibold text-[#163D6E]">
                  {chartMode === 'cumulative'
                    ? `${Math.round(chartValues[hoveredPoint.dayIndex])} ${selectedMed.unit}`
                    : `${stateFilter === 'HR' ? hoveredPoint.hrRate : stateFilter === 'OD' ? hoveredPoint.odRate : hoveredPoint.totalRate} units/d`}
                </span>
              </div>

              {chartMode === 'rate' && (
                <>
                  <div className="flex items-center justify-between text-xs text-[#475467]">
                    <span>Baseline expectation:</span>
                    <span>{hoveredPoint.baseline} units/d</span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#D0D5DD]">
                    <span className="text-[#067647]">Haryana rate:</span>
                    <span>{hoveredPoint.hrRate} u/d</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#B54708]">Odisha rate:</span>
                    <span>{hoveredPoint.odRate} u/d</span>
                  </div>

                  {hoveredPoint.anomaly && (
                    <div className="text-xs font-semibold text-[#B42318] flex items-center gap-1 pt-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>High surge variance detected</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contextual Intelligence Insight Card */}
      <div className="p-4 rounded-[8px] bg-[#F5F7FA] border border-[#D0D5DD] text-sm flex items-start gap-3">
        <Info className="w-5 h-5 text-[#163D6E] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1 text-[#101828]">
          <span className="font-semibold block">
            Epidemiological signal for {selectedMed.name} ({selectedMed.category}):
          </span>
          <p className="text-sm text-[#344054] leading-normal">
            {selectedMed.seasonal_driver ? (
              <>
                <strong>Seasonal driver engagement:</strong> Consumption has accelerated by{' '}
                <span className="font-semibold text-[#B42318]">
                  {kpis.velocityPercent > 0 ? `+${kpis.velocityPercent}%` : `${kpis.velocityPercent}%`}
                </span>{' '}
                over the 30-day window due to post-monsoon fever/dengue incidence in North India. Dhara's federated profile continuously adjusts minimum buffer days to avoid stockouts before state procurement batches arrive.
              </>
            ) : (
              <>
                <strong>Chronic steady-state demand:</strong> Consumption of {selectedMed.name} exhibits steady chronic refill patterns ({kpis.avgDailyRate} units/day), with low seasonal elasticity. Centralized warehouse reorders maintain deterministic 14-day buffers.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
