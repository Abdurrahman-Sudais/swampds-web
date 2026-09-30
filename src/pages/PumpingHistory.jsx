import React from 'react';
import { Activity, History, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { usePumpHistory, useSwampdsData } from '../data/swampdsData';
import { TableRowsSkeleton } from '../components/skeleton/Skeleton';

export default function PumpingHistory() {
  const history = usePumpHistory();
  const { alerts } = useSwampdsData();

  // Live alerts are the single source of truth here - no placeholder rows are mixed in,
  // so an empty log means no events have actually been recorded yet.
  const events = alerts.slice(0, 8).map(a => ({
    border: a.severity === 'critical' ? 'border-red-500' : a.severity === 'warning' ? 'border-amber-500' : 'border-blue-500',
    time: a.time,
    title: a.severity === 'critical' ? 'Alert / Divergence' : a.severity === 'warning' ? 'Warning Issued' : 'System Notice',
    desc: a.message,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Full pump event table */}
        <Card className="lg:col-span-2">
          <CardHeader title="Pumping Session Log" icon={History} />
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-400">All recorded pump on/off sessions.</p>
            {history?.length > 0 && (
              <span className="text-[11px] text-slate-400 sm:hidden">Scroll table →</span>
            )}
          </div>

          {history === null ? (
            <TableRowsSkeleton rows={5} />
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No sessions logged yet</p>
              <p className="text-xs mt-1">Sessions appear here once the hardware starts logging pump cycles to Firebase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 text-xs">
                    {['Date', 'Start', 'End', 'Duration'].map(h => (
                      <th key={h} className="pb-3 font-medium pr-4 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0 text-slate-700 hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 font-medium">{row.date}</td>
                      <td className="py-3 pr-4">{row.start}</td>
                      <td className="py-3 pr-4">{row.end}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{row.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Event log */}
        <Card>
          <CardHeader title="System Event Log" icon={Activity} />
          <p className="text-xs text-slate-400 mb-4">Real-time alerts and state changes.</p>
          {events.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-300" />
              <p className="text-sm font-medium">No events yet</p>
              <p className="text-xs mt-1">Warnings, leaks and pump/twin activity will appear here as they happen.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {events.map(({ border, time, title, desc }, idx) => (
                <div key={idx} className={`flex gap-3 text-sm border-l-2 ${border} pl-3 py-0.5`}>
                  <div className="text-slate-400 w-16 flex-shrink-0 text-xs pt-0.5 font-mono">{time}</div>
                  <div>
                    <p className="font-semibold text-slate-800 text-xs sm:text-sm">{title}</p>
                    <p className="text-slate-500 mt-0.5 text-xs leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
