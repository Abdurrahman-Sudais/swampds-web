import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader } from '../Card';
import ChartPlaceholder, { MIN_CHART_POINTS } from './ChartPlaceholder';

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: 'none',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
};

/**
 * @param {{ data: { time: string, level: number }[], noCard?: boolean }} props
 * Memoised and not animated: it shows live data, so it should only redraw when a sample is added.
 */
function WaterLevelChart({ data, noCard = false }) {
  const chartContent = data.length < MIN_CHART_POINTS ? (
    <ChartPlaceholder />
  ) : (
    <div className="h-64 sm:h-72 mt-4 text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="wlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            minTickGap={35}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Water Level']} />
          <Area
            type="monotone"
            dataKey="level"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#wlGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  if (noCard) return chartContent;

  return (
    <Card>
      <CardHeader title="Water Level Trend" />
      {chartContent}
    </Card>
  );
}

export default React.memo(WaterLevelChart);
