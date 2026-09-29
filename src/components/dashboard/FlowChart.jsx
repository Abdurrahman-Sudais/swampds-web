import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader } from '../Card';
import ChartPlaceholder, { MIN_CHART_POINTS } from './ChartPlaceholder';

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: 'none',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
};

const LINES = [
  { key: 'F1', name: 'Flow Sensor 1', color: '#10b981' },
  { key: 'F2', name: 'Flow Sensor 2', color: '#f59e0b' },
];

/**
 * @param {{ data: { time: string, F1: number, F2: number }[], noCard?: boolean, animate?: boolean }} props
 * Animation is off by default: this chart shows live data, and re-animating the lines on every
 * sample reads as lag. Memoised so live readings (every 1-2 s) don't redraw an unchanged chart.
 */
function FlowChart({ data, noCard = false, animate = false }) {
  const chartContent = data.length < MIN_CHART_POINTS ? (
    <ChartPlaceholder />
  ) : (
    <div className="h-64 sm:h-72 mt-4 text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
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
            domain={[0, 7]}
            tickFormatter={v => `${v}`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => [`${v} L/min`, name]}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          />
          {/* Normal operating band */}
          <ReferenceLine y={5.3} stroke="#cbd5e1" strokeDasharray="4 2" />
          <ReferenceLine y={4.4} stroke="#cbd5e1" strokeDasharray="4 2" />
          {LINES.map(({ key, name, color }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={name}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={animate}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  if (noCard) return chartContent;

  return (
    <Card>
      <CardHeader title="Flow Rate Trend" />
      {chartContent}
    </Card>
  );
}

export default React.memo(FlowChart);
