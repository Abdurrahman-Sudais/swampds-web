import React from 'react';
import { Settings, Info, TrendingDown, TrendingUp, Droplets } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { PUMP_THRESHOLDS } from '../data/swampdsData';
import TankGauge, { TankStylePicker } from '../components/TankGauge';
import { useDashboardTankStyle } from '../components/tankStyle';

export default function SettingsPage() {
  const [tankStyle, setTankStyle] = useDashboardTankStyle();

  return (
    <div className="space-y-6 max-w-2xl">

      <Card>
        <CardHeader title="Tank Style" icon={Droplets} iconColorClass="text-blue-500" />
        <p className="text-xs sm:text-sm text-slate-500 mb-4 leading-relaxed">
          How the water tank is drawn on the dashboard and Water Level page. Saved in this browser only.
        </p>
        <div className="flex items-center gap-5">
          <TankGauge percent={60} style={tankStyle} active />
          <TankStylePicker value={tankStyle} onChange={setTankStyle} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Automatic Control Thresholds" icon={Settings} iconColorClass="text-blue-500" />
        <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
          These thresholds control when the pump starts and stops in <strong>Auto</strong> mode.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <div className="p-4 bg-red-50 rounded-xl border border-red-100">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Pump ON at or below
            </div>
            <div className="text-3xl font-bold text-red-600 mt-2">
              {PUMP_THRESHOLDS.lowCm} cm <span className="text-base font-semibold text-red-400">({PUMP_THRESHOLDS.low}%)</span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-snug">
              Pump starts automatically when the water level drops to this.
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Pump OFF at or above
            </div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {PUMP_THRESHOLDS.fullCm} cm <span className="text-base font-semibold text-blue-400">({PUMP_THRESHOLDS.full}%)</span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-snug">
              Pump stops automatically when the water level rises to this.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 mt-5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs sm:text-sm">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            These values are set in the device firmware and shown as water depth. 100% is the highest
            level the ultrasonic sensor can safely measure: the 18 cm tank minus the 4.5 cm the sensor
            sits below the rim and 3 cm of clearance. This dashboard only displays them.
          </span>
        </div>
      </Card>

    </div>
  );
}
