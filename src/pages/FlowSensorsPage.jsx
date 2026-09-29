import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts';
import { Activity, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import ChartPlaceholder, { MIN_CHART_POINTS } from '../components/dashboard/ChartPlaceholder';
import { useSwampdsData, useChartHistory } from '../data/swampdsData';

// Expected operating range for each flow sensor
const FLOW_RANGE = { min: 4.4, max: 5.3 }; // L/min

// Below this upstream flow the leak check is skipped (same value in the firmware and the twin)
const MIN_FLOW_LPM = 0.5;

const SENSOR_META = [
  {
    key:      'flow1',
    dataKey:  'F1',
    label:    'Flow Sensor 1 - Near pump',
    color:    '#10b981',
    desc:     'First sensor, immediately after the pump. It is the reference Sensor 2 is compared against. A low reading indicates a pump or supply problem.',
  },
  {
    key:      'flow2',
    dataKey:  'F2',
    label:    'Flow Sensor 2 - Downstream',
    color:    '#f59e0b',
    desc:     'Downstream sensor. Reading well below Sensor 1 indicates a leak in the pipe between them. Pipe past this sensor is not monitored.',
  },
];

const STATUS_EXPLANATIONS = {
  normal:  { Icon: CheckCircle2, cls: 'bg-green-50  border-green-200  text-green-800',  iconCls: 'text-green-500',  text: 'Sensor 2 is reading within tolerance of Sensor 1. No leak detected between them.' },
  warning: { Icon: AlertTriangle, cls: 'bg-amber-50  border-amber-200  text-amber-800', iconCls: 'text-amber-500', text: 'Something needs attention - a flow difference being verified, or a pump or water-level issue. Check the alerts for the reason.' },
  leak:    { Icon: AlertTriangle, cls: 'bg-orange-50 border-orange-200 text-orange-800', iconCls: 'text-orange-500', text: 'Sensor 2 has read well below Sensor 1 for long enough to confirm a leak in the pipe between them. Inspect immediately.' },
  fault:   { Icon: ShieldAlert,   cls: 'bg-red-50    border-red-200    text-red-800',    iconCls: 'text-red-500',   text: 'A sensor is reading near-zero flow (< 1.2 L/min). This indicates sensor failure or complete blockage. Manual inspection required.' },
};

const TOOLTIP_STYLE = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

function SensorSection({ sensorKey, dataKey, label, color, desc, value, chartData }) {
  const isNormal = value >= FLOW_RANGE.min && value <= FLOW_RANGE.max;
  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 flex-shrink-0" style={{ color }} />
            <h3 className="font-semibold text-slate-800">{label}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-lg leading-snug">{desc}</p>
        </div>
        <div className="flex items-baseline sm:flex-col sm:items-end gap-2 sm:gap-0 flex-shrink-0">
          <div className="text-2xl sm:text-3xl font-bold text-slate-800">
            {(value ?? 0).toFixed(2)}{' '}
            <span className="text-xs text-slate-500 font-normal">L/min</span>
          </div>
          <span className={`text-xs font-semibold sm:mt-1 inline-block ${isNormal ? 'text-green-600' : 'text-red-600'}`}>
            {isNormal ? '✓ Normal' : '⚠ Diverged'}
          </span>
        </div>
      </div>
      {chartData.length < MIN_CHART_POINTS ? (
        <ChartPlaceholder className="h-44 sm:h-48" />
      ) : (
      <div className="h-44 sm:h-48 text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} minTickGap={35} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 7]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} L/min`]} />
            <ReferenceLine y={FLOW_RANGE.min} stroke="#e2e8f0" strokeDasharray="4 2" />
            <ReferenceLine y={FLOW_RANGE.max} stroke="#e2e8f0" strokeDasharray="4 2" />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </Card>
  );
}

export default function FlowSensorsPage() {
  const { sensors, status, detection } = useSwampdsData();
  const { flowData }        = useChartHistory();

  const statusCfg = STATUS_EXPLANATIONS[status.systemStatus] ?? STATUS_EXPLANATIONS.normal;
  const { Icon: StatusIcon, cls, iconCls, text: statusText } = statusCfg;

  // Live difference between the two sensors (what the leak check looks at)
  const f1      = Number(sensors.flow1) || 0;
  const f2      = Number(sensors.flow2) || 0;
  const lossLpm = f1 - f2;
  const lossPct = f1 >= MIN_FLOW_LPM ? (lossLpm / f1) * 100 : null;

  const rules = [
    { label: 'Leak trigger',  value: detection.tolerancePct === null ? 'Not reported yet' : `Sensor 2 more than ${detection.tolerancePct}% below Sensor 1`, color: 'text-orange-600' },
    { label: 'Must last',     value: detection.persistSec === null ? 'Not reported yet' : `${detection.persistSec} s continuously`, color: 'text-amber-600' },
    { label: 'Checked when',  value: `Sensor 1 reads ${MIN_FLOW_LPM} L/min or more`, color: 'text-slate-600' },
  ];

  return (
    <div className="space-y-6">

      {/* System status explanation */}
      <div className={`flex items-start gap-3 p-4 rounded-2xl border ${cls}`}>
        <StatusIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconCls}`} />
        <div>
          <p className="font-semibold text-sm capitalize">
            {status.systemStatus} - Current System State
          </p>
          <p className="text-xs sm:text-sm mt-0.5 opacity-90 leading-relaxed">{statusText}</p>
        </div>
      </div>

      {/* Individual sensor charts */}
      <div className="space-y-6">
        {SENSOR_META.map(({ key, ...props }) => (
          <SensorSection
            key={key}
            sensorKey={key}
            value={sensors[key]}
            chartData={flowData}
            {...props}
          />
        ))}
      </div>

      {/* Flow readings table + detection thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Live readings vs expected range */}
        <Card>
          <CardHeader title="Live Readings vs Expected Range" icon={Activity} iconColorClass="text-slate-400" />
          <p className="text-xs text-slate-400 mb-4">
            Expected operating range: {FLOW_RANGE.min}–{FLOW_RANGE.max} L/min per sensor.
          </p>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[380px] text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  {['Sensor', 'Expected range', 'Live reading', 'Status'].map(h => (
                    <th key={h} className="pb-3 font-medium pr-3 text-xs sm:text-sm">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SENSOR_META.map(({ key, label }) => {
                  const val = sensors[key] ?? 0;
                  const ok  = val >= FLOW_RANGE.min && val <= FLOW_RANGE.max;
                  return (
                    <tr key={key} className="border-b border-slate-50 last:border-0 text-slate-700">
                      <td className="py-3 pr-3 font-medium text-xs leading-tight">
                        {label.split(' - ')[0]}
                      </td>
                      <td className="py-3 pr-3 text-slate-500 text-xs sm:text-sm">
                        {FLOW_RANGE.min}–{FLOW_RANGE.max} L/min
                      </td>
                      <td className="py-3 pr-3 font-mono font-semibold text-xs sm:text-sm">
                        {val.toFixed(2)} L/min
                      </td>
                      <td className="py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {ok ? 'Normal' : 'Diverged'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="text-slate-500 border-t border-slate-100">
                  <td className="pt-3 text-xs font-medium" colSpan={2}>
                    Flow lost between Sensor 1 and 2
                  </td>
                  <td className="pt-3 font-mono font-semibold text-xs sm:text-sm" colSpan={2}>
                    {lossLpm.toFixed(2)} L/min{lossPct !== null && ` (${lossPct.toFixed(1)}%)`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Detection thresholds */}
        <Card>
          <CardHeader title="Leak Detection Rule" icon={Activity} iconColorClass="text-slate-400" />
          <p className="text-xs text-slate-400 mb-4">
            A leak is declared when Sensor 2 stays below Sensor 1 by more than the tolerance for the
            full persistence time. Only the pipe between the two sensors is monitored.
          </p>
          <div className="space-y-3">
            {rules.map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs sm:text-sm">
                <span className="font-medium text-slate-700">{label}</span>
                <span className={`font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Values are reported by the connected device or digital twin and cannot be changed from this dashboard.
          </p>
        </Card>
      </div>

    </div>
  );
}
