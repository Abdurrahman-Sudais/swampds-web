import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Activity, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import ChartPlaceholder, { MIN_CHART_POINTS } from '../components/dashboard/ChartPlaceholder';
import { useSwampdsData, useChartHistory } from '../data/swampdsData';
import { flowSensorStatus, segmentLoss, MIN_FLOW_LPM } from '../data/flowStatus';

const TONE_CLASS = { ok: 'text-green-600', bad: 'text-red-600', idle: 'text-slate-400' };
const TONE_BADGE = { ok: 'bg-green-100 text-green-700', bad: 'bg-red-100 text-red-700', idle: 'bg-slate-100 text-slate-500' };

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
    label:    'Flow Sensor 2 - Midpoint',
    color:    '#f59e0b',
    desc:     'Mid-pipeline sensor. Reading well below Sensor 1 indicates a leak in section A, between Sensors 1 and 2. It is also the reference for Sensor 3.',
  },
  {
    key:      'flow3',
    dataKey:  'F3',
    label:    'Flow Sensor 3 - Outlet',
    color:    '#a855f7',
    desc:     'End-of-pipe sensor, before the delivery tank. Reading well below Sensor 2 indicates a leak in section B, between Sensors 2 and 3.',
  },
];

// The two monitored pipe sections, each judged between neighbouring sensors.
const SECTIONS = [
  { id: 'A', up: 'flow1', down: 'flow2', label: 'section A (Sensor 1 → 2)' },
  { id: 'B', up: 'flow2', down: 'flow3', label: 'section B (Sensor 2 → 3)' },
];

const STATUS_EXPLANATIONS = {
  normal:  { Icon: CheckCircle2, cls: 'bg-green-50  border-green-200  text-green-800',  iconCls: 'text-green-500',  text: 'Each sensor is reading within tolerance of the one before it. No leak detected in either section.' },
  warning: { Icon: AlertTriangle, cls: 'bg-amber-50  border-amber-200  text-amber-800', iconCls: 'text-amber-500', text: 'Something needs attention - a flow difference being verified, or a pump or water-level issue. Check the alerts for the reason.' },
  leak:    { Icon: AlertTriangle, cls: 'bg-orange-50 border-orange-200 text-orange-800', iconCls: 'text-orange-500', text: 'A sensor has read well below the one before it for long enough to confirm a leak in the pipe between them. The alerts name the section. Inspect immediately.' },
  fault:   { Icon: ShieldAlert,   cls: 'bg-red-50    border-red-200    text-red-800',    iconCls: 'text-red-500',   text: 'A sensor is reading near-zero flow (< 1.2 L/min). This indicates sensor failure or complete blockage. Manual inspection required.' },
};

const TOOLTIP_STYLE = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

function SensorSection({ dataKey, label, color, desc, value, status, chartData }) {
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
          <span className={`text-xs font-semibold sm:mt-1 inline-block ${TONE_CLASS[status.tone]}`}>
            {status.label}
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
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 'auto']} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} L/min`]} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
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

  // Live loss across each section (what the leak check looks at)
  const losses = SECTIONS.map((sec) => ({ ...sec, ...segmentLoss(sensors, sec.up, sec.down) }));

  const rules = [
    { label: 'Leak trigger',  value: detection.tolerancePct === null ? 'Not reported yet' : `A sensor more than ${detection.tolerancePct}% below the one before it`, color: 'text-orange-600' },
    { label: 'Must last',     value: detection.persistSec === null ? 'Not reported yet' : `${detection.persistSec} s continuously`, color: 'text-amber-600' },
    { label: 'Checked when',  value: `The upstream sensor reads ${MIN_FLOW_LPM} L/min or more`, color: 'text-slate-600' },
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
            value={sensors[key]}
            status={flowSensorStatus(key, sensors, detection)}
            chartData={flowData}
            {...props}
          />
        ))}
      </div>

      {/* Flow readings table + detection thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Live readings vs expected range */}
        <Card>
          <CardHeader title="Live Readings" icon={Activity} iconColorClass="text-slate-400" />
          <p className="text-xs text-slate-400 mb-4">
            Each sensor is judged against the one before it, so no fixed flow rate is assumed.
          </p>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[380px] text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  {['Sensor', 'Position', 'Live reading', 'Status'].map(h => (
                    <th key={h} className="pb-3 font-medium pr-3 text-xs sm:text-sm">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SENSOR_META.map(({ key, label }) => {
                  const val = sensors[key] ?? 0;
                  const st  = flowSensorStatus(key, sensors, detection);
                  return (
                    <tr key={key} className="border-b border-slate-50 last:border-0 text-slate-700">
                      <td className="py-3 pr-3 font-medium text-xs leading-tight">
                        {label.split(' - ')[0]}
                      </td>
                      <td className="py-3 pr-3 text-slate-500 text-xs sm:text-sm">
                        {label.split(' - ')[1]}
                      </td>
                      <td className="py-3 pr-3 font-mono font-semibold text-xs sm:text-sm">
                        {val.toFixed(2)} L/min
                      </td>
                      <td className="py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_BADGE[st.tone]}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {losses.map(({ id, label, lpm, pct }, i) => (
                  <tr key={id} className={`text-slate-500 ${i === 0 ? 'border-t border-slate-100' : ''}`}>
                    <td className={`${i === 0 ? 'pt-3' : 'pt-1.5'} text-xs font-medium`} colSpan={2}>
                      Flow lost, {label}
                    </td>
                    <td className={`${i === 0 ? 'pt-3' : 'pt-1.5'} font-mono font-semibold text-xs sm:text-sm`} colSpan={2}>
                      {lpm.toFixed(2)} L/min{pct !== null && ` (${pct.toFixed(1)}%)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Detection thresholds */}
        <Card>
          <CardHeader title="Leak Detection Rule" icon={Activity} iconColorClass="text-slate-400" />
          <p className="text-xs text-slate-400 mb-4">
            A leak is declared when a sensor stays below the one before it by more than the tolerance
            for the full persistence time: Sensor 2 against Sensor 1 (section A), Sensor 3 against
            Sensor 2 (section B). The section that fails is the one reported.
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
