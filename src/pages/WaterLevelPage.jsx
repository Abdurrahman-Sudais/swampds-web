import React from 'react';
import { Droplets, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import TankGauge from '../components/TankGauge';
import { useDashboardTankStyle } from '../components/tankStyle';
import WaterLevelChart from '../components/dashboard/WaterLevelChart';
import { useSwampdsData, useChartHistory, PUMP_THRESHOLDS as THRESHOLDS } from '../data/swampdsData';

export default function WaterLevelPage() {
  const { sensors, status } = useSwampdsData();
  const { waterLevelData } = useChartHistory();
  const [tankStyle] = useDashboardTankStyle();

  const { waterLevelPercent: pct, waterLevelCm: cm, lastUpdated } = sensors;

  const levelStatus =
    pct >= THRESHOLDS.full ? { label: 'Tank Full',    color: 'text-blue-600',  bg: 'bg-blue-50'  } :
    pct <= THRESHOLDS.low  ? { label: 'Tank Low',     color: 'text-red-600',   bg: 'bg-red-50'   } :
                              { label: 'Level Normal', color: 'text-green-600', bg: 'bg-green-50' };

  const lastUpdatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';

  return (
    <div className="space-y-6">

      {/* Reading cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

        {/* Big gauge */}
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader title="Current Level" icon={Droplets} iconColorClass="text-blue-500" />
          <div className="flex items-end justify-between mt-2">
            <div>
              <div className="text-4xl sm:text-5xl font-bold text-blue-600 leading-none">
                {pct}<span className="text-xl sm:text-2xl ml-1">%</span>
              </div>
              <div className="text-base sm:text-lg text-slate-500 mt-2 font-medium">{cm} cm depth</div>
              <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-semibold ${levelStatus.bg} ${levelStatus.color}`}>
                {levelStatus.label}
              </div>
            </div>
            <div className="mr-1 sm:mr-2 flex-shrink-0">
              <TankGauge percent={pct} style={tankStyle} active={status.pumpStatus === 'on'} className="w-20 h-36 sm:w-24 sm:h-40" />
            </div>
          </div>
        </Card>

        {/* Last updated */}
        <Card>
          <CardHeader title="Last Sensor Update" />
          <div className="text-xl sm:text-2xl font-bold text-slate-800 mt-2">{lastUpdatedStr}</div>
          <div className="text-sm text-slate-500 mt-1">
            {lastUpdated
              ? new Date(lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : 'No timestamp reported'}
          </div>
          <div className="text-xs text-green-600 font-semibold mt-3 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            Live data
          </div>
        </Card>

        {/* Auto control thresholds */}
        <Card className="sm:col-span-2 lg:col-span-2">
          <CardHeader title="Auto-Control Thresholds" />
          <p className="text-xs text-slate-400 mb-4">
            In <strong>Auto</strong> mode the pump starts/stops at these levels automatically.
            Shown for reference; not editable from this dashboard.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-slate-700">Pump ON threshold</span>
              </div>
              <span className="font-bold text-red-600">≤ {THRESHOLDS.lowCm} cm ({THRESHOLDS.low}%)</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-slate-700">Pump OFF threshold</span>
              </div>
              <span className="font-bold text-blue-600">≥ {THRESHOLDS.fullCm} cm ({THRESHOLDS.full}%)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Full-width trend chart */}
      <Card>
        <CardHeader title="Water Level Trend" />
        <WaterLevelChart data={waterLevelData} noCard />
      </Card>

    </div>
  );
}
