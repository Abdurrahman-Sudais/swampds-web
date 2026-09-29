import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardHeader } from '../Card';
import { Sparkline } from '../Sparkline';

const NORMAL_RANGE = { min: 4.4, max: 5.3 }; // L/min

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
 * }} props
 * `history` is the recorded flow series from useChartHistory(); `historyKey` picks
 * this sensor's column (F1/F2).
 */
export default function FlowSensorCard({ title, value, sublabel, color, iconColorClass, history = [], historyKey }) {
  const sparkData = useMemo(
    () => history.slice(-SPARKLINE_POINTS).map(p => ({ val: p[historyKey] })),
    [history, historyKey],
  );
  const isNormal  = value >= NORMAL_RANGE.min && value <= NORMAL_RANGE.max;

  return (
    <Card>
      <CardHeader title={title} icon={Activity} iconColorClass={iconColorClass} />
      <div className="text-3xl font-bold text-slate-800">
        {(value ?? 0).toFixed(2)}{' '}
        <span className="text-sm font-medium text-slate-500">L/min</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs font-semibold" style={{ color }}>{sublabel}</span>
        <span className={`text-xs font-semibold ${isNormal ? 'text-green-600' : 'text-red-600'}`}>
          {isNormal ? '· Normal' : '· Diverged'}
        </span>
      </div>
      {sparkData.length >= 2
        ? <Sparkline data={sparkData} dataKey="val" color={color} />
        : <div className="h-12 mt-2" aria-hidden="true" />}
    </Card>
  );
}
