import React from 'react';
import { useSwampdsData, useChartHistory, sendPumpCommand, setControlMode } from '../data/swampdsData';
import { useAuth } from '../auth/AuthContext';
import { flowSensorStatus } from '../data/flowStatus';

import SystemStatusBanner  from '../components/dashboard/SystemStatusBanner';
import WaterLevelCard      from '../components/dashboard/WaterLevelCard';
import FlowSensorCard      from '../components/dashboard/FlowSensorCard';
import PumpControlCard     from '../components/dashboard/PumpControlCard';
import WaterLevelChart     from '../components/dashboard/WaterLevelChart';
import FlowChart           from '../components/dashboard/FlowChart';
import AlertsPanel         from '../components/dashboard/AlertsPanel';

const FLOW_SENSORS = [
  { key: 'flow1', historyKey: 'F1', title: 'Flow Sensor 1', sublabel: 'Near pump',  color: '#10b981', iconColorClass: 'text-emerald-500' },
  { key: 'flow2', historyKey: 'F2', title: 'Flow Sensor 2', sublabel: 'Downstream', color: '#f59e0b', iconColorClass: 'text-amber-500'   },
];

export default function Dashboard() {
  const { sensors, status, alerts, detection } = useSwampdsData();
  const { flowData, waterLevelData } = useChartHistory();
  const { canEdit } = useAuth();

  const handlePumpCommand = (cmd) => sendPumpCommand(cmd);
  const handleToggleMode  = () => setControlMode(status.controlMode === 'auto' ? 'manual' : 'auto');

  return (
    <div className="space-y-6">

      {/* 1 - Safety banner (full width) */}
      <SystemStatusBanner systemStatus={status.systemStatus} />

      {/* 2 - KPI cards row: 1 col on mobile, 2 col on tablet, 4 col on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <WaterLevelCard percent={sensors.waterLevelPercent} cm={sensors.waterLevelCm} active={status.pumpStatus === 'on'} />

        {FLOW_SENSORS.map(({ key, ...props }) => (
          <FlowSensorCard key={key} value={sensors[key]} history={flowData} status={flowSensorStatus(key, sensors, detection)} {...props} />
        ))}

        <PumpControlCard
          pumpStatus={status.pumpStatus}
          controlMode={status.controlMode}
          onToggleMode={handleToggleMode}
          onPumpCommand={handlePumpCommand}
          readOnly={!canEdit}
        />
      </div>

      {/* 3 - Charts + alerts row: 1 col on mobile & tablet, charts stacked + alerts aside on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <WaterLevelChart data={waterLevelData} />
          <FlowChart       data={flowData} />
        </div>
        <AlertsPanel alerts={alerts} />
      </div>

    </div>
  );
}
