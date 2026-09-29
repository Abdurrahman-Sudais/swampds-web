import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardHeader } from '../Card';
import { Sparkline } from '../Sparkline';

const TONE_CLASS = { ok: 'text-green-600', bad: 'text-red-600', idle: 'text-slate-400' };

const SPARKLINE_POINTS = 30;

/**
 * @param {{
 *   title: string,
 *   value: number,
 *   sublabel: string,
 *   color: string,
 *   iconColorClass: string,
 *   history: object[],
 *   historyKey: string,
 *   status: {{ tone: 'ok'|'bad'|'idle', label: string }},
 * }} props
 * `status` comes from flowSensorStatus() (Sensor 2 is judged against Sensor 1).
 * `history` is the recorded flow series from useChartHistory(); `historyKey` picks
 * this sensor's column (F1/F2).
 */
export default function FlowSensorCard({ title, value, sublabel, color, iconColorClass, history = [], historyKey, status }) {
  const sparkData = useMemo(
    () => history.slice(-SPARKLINE_POINTS).map(p => ({ val: p[historyKey] })),
    [history, historyKey],
  );

  return (
    <Card>
      <CardHeader title={title} icon={Activity} iconColorClass={iconColorClass} />
      <div className="text-3xl font-bold text-slate-800">
        {(value ?? 0).toFixed(2)}{' '}
        <span className="text-sm font-medium text-slate-500">L/min</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs font-semibold" style={{ color }}>{sublabel}</span>
        {status && (
          <span className={`text-xs font-semibold ${TONE_CLASS[status.tone]}`}>· {status.label}</span>
        )}
      </div>
      {sparkData.length >= 2
        ? <Sparkline data={sparkData} dataKey="val" color={color} />
        : <div className="h-12 mt-2" aria-hidden="true" />}
    </Card>
  );
}
