import React, { useEffect, useState } from 'react';
import { Cpu, FlaskConical, WifiOff } from 'lucide-react';
import { describeDataSource } from '../../twin/contract.js';

/**
 * Tells the operator where the dashboard's data comes from:
 *  - simulated: the Digital Twin is publishing (not physical hardware)
 *  - hybrid:    the Digital Twin is publishing with the prototype linked (real level, real outputs)
 *  - offline:   the publisher stopped sending, so the values on screen are the last ones received
 * Shows nothing for ordinary live data.
 *
 * @param {{ meta: { source: string|null, online: boolean|null, receivedAt: number|null } }} props
 */
export default function DataSourceBanner({ meta }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const info = describeDataSource(meta, now);
  if (info.kind === 'live') return null;

  if (info.kind === 'offline') {
    const who = info.simulated ? 'The Digital Twin has stopped sending data' : 'No recent data from the device';
    const ago = info.ageSec === null ? '' : ` (last update ${info.ageSec}s ago)`;
    return (
      <div role="status" className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-slate-800 text-slate-100 text-xs sm:text-sm">
        <WifiOff className="w-4 h-4 flex-shrink-0" />
        <span><strong>{who}</strong>{ago}. The values shown are the last ones received.</span>
      </div>
    );
  }

  if (info.kind === 'hybrid') {
    return (
      <div role="status" className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-sky-50 text-sky-900 text-xs sm:text-sm border-b border-sky-100">
        <Cpu className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Hardware-in-the-loop.</strong> Water level, pump and alarms are on the prototype; flow readings come from the Digital Twin model.
        </span>
      </div>
    );
  }

  return (
    <div role="status" className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-amber-100 text-amber-900 text-xs sm:text-sm border-b border-amber-200">
      <FlaskConical className="w-4 h-4 flex-shrink-0" />
      <span>
        <strong>Simulated data.</strong> This dashboard is showing output from the SWAMPDS Digital Twin, not physical hardware.
      </span>
    </div>
  );
}
