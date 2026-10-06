import React, { useState } from 'react';
import { Settings, Info, TrendingDown, TrendingUp, Droplets, CheckCircle2, Clock, BellRing, AlertTriangle } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { useSwampdsData, setPumpThresholds, resetPumpThresholds } from '../data/swampdsData';
import { useAuth } from '../auth/AuthContext';
import { PUMP_LIMITS, PUMP_ON_CM, PUMP_OFF_CM, FULL_SCALE_CM, validatePumpThresholds, levelPct } from '../twin/config.js';
import TankGauge, { TankStylePicker } from '../components/TankGauge';
import { useDashboardTankStyle } from '../components/tankStyle';
import {
  useNotificationPrefs, setNotificationPrefs, notificationPermission, showNotification,
} from '../components/layout/useAlertNotifications';
import { TEST_NOTIFICATION } from '../data/notifications';

const pct = (cm) => (Number.isFinite(cm) ? `${Math.round(levelPct(cm))}%` : '-');

function LevelField({ tone, Icon, title, hint, value, onChange, min, max, readOnly }) {
  const box = tone === 'low' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100';
  const ink = tone === 'low' ? 'text-red-600' : 'text-blue-600';
  const soft = tone === 'low' ? 'text-red-400' : 'text-blue-400';
  const num = Number(value);
  return (
    <div className={`p-4 rounded-xl border ${box}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Icon className={`w-4 h-4 ${ink}`} />
        {title}
      </div>
      {readOnly ? (
        <div className={`text-3xl font-bold mt-2 ${ink}`}>
          {value} cm <span className={`text-base font-semibold ${soft}`}>({pct(num)})</span>
        </div>
      ) : (
        <div className="flex items-baseline gap-2 mt-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${title} (cm)`}
            className={`w-24 text-2xl font-bold ${ink} bg-white border border-slate-200 rounded-lg px-2 py-1`}
          />
          <span className="text-sm font-medium text-slate-500">cm</span>
          <span className={`text-sm font-semibold ${soft}`}>({pct(num)})</span>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-1.5 leading-snug">{hint}</p>
    </div>
  );
}

function ThresholdsCard() {
  const { thresholds, deviceThresholds } = useSwampdsData();
  const { canEdit } = useAuth();

  // The inputs show the saved values (live, e.g. if another admin changes them) until this admin
  // starts editing; `draft` then holds what they typed until it is saved or reset.
  const [draft, setDraft] = useState(null); // { on: string, off: string } | null
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { ok: boolean, text: string }

  const onCm  = draft?.on  ?? String(thresholds.lowCm);
  const offCm = draft?.off ?? String(thresholds.fullCm);
  const edit = (field) => (v) => { setDraft({ on: onCm, off: offCm, [field]: v }); setMessage(null); };

  const problem = validatePumpThresholds(Number(onCm), Number(offCm));
  const unchanged = Number(onCm) === thresholds.lowCm && Number(offCm) === thresholds.fullCm;

  const save = async () => {
    setSaving(true);
    try {
      await setPumpThresholds(Number(onCm), Number(offCm));
      setDraft(null);
      setMessage({ ok: true, text: 'Saved. The device applies new levels within about 10 seconds.' });
    } catch (error) {
      setMessage({ ok: false, text: error?.code === 'PERMISSION_DENIED' ? 'The database refused this change.' : error.message });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await resetPumpThresholds();
      setDraft(null);
      setMessage({ ok: true, text: 'Back to the default levels.' });
    } catch (error) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const deviceInSync = deviceThresholds
    && deviceThresholds.lowCm === thresholds.lowCm
    && deviceThresholds.fullCm === thresholds.fullCm;

  return (
    <Card>
      <CardHeader title="Automatic Control Thresholds" icon={Settings} iconColorClass="text-blue-500" />
      <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
        These levels control when the pump starts and stops in <strong>Auto</strong> mode.
        {canEdit ? ' As an admin you can change them within the safe limits below.' : ' Only admins can change them.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <LevelField
          tone="low" Icon={TrendingDown} title="Pump ON at or below"
          hint="Pump starts automatically when the water level drops to this."
          value={canEdit ? onCm : thresholds.lowCm} onChange={edit('on')}
          min={PUMP_LIMITS.minOnCm} max={PUMP_LIMITS.maxOffCm - PUMP_LIMITS.minGapCm}
          readOnly={!canEdit}
        />
        <LevelField
          tone="full" Icon={TrendingUp} title="Pump OFF at or above"
          hint="Pump stops automatically when the water level rises to this."
          value={canEdit ? offCm : thresholds.fullCm} onChange={edit('off')}
          min={PUMP_LIMITS.minOnCm + PUMP_LIMITS.minGapCm} max={PUMP_LIMITS.maxOffCm}
          readOnly={!canEdit}
        />
      </div>

      {canEdit && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">
            Safe limits: ON at least {PUMP_LIMITS.minOnCm} cm, OFF at most {PUMP_LIMITS.maxOffCm} cm,
            and OFF at least {PUMP_LIMITS.minGapCm} cm above ON. Defaults: {PUMP_ON_CM} cm / {PUMP_OFF_CM} cm.
          </p>
          {problem && <p className="text-xs font-medium text-red-600">{problem}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || Boolean(problem) || unchanged}
              className="px-4 py-2 min-h-[40px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save thresholds'}
            </button>
            {thresholds.custom && (
              <button
                type="button"
                onClick={reset}
                disabled={saving}
                className="px-4 py-2 min-h-[40px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium disabled:opacity-40"
              >
                Reset to defaults
              </button>
            )}
          </div>
          {message && (
            <p className={`text-xs font-medium ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-5 text-xs text-slate-500">
        {deviceThresholds === null ? (
          <><Info className="w-4 h-4 flex-shrink-0" /> No device has reported its levels yet.</>
        ) : deviceInSync ? (
          <><CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /> The device is using these levels.</>
        ) : (
          <><Clock className="w-4 h-4 text-amber-500 flex-shrink-0" /> The device is still using {deviceThresholds.lowCm} cm / {deviceThresholds.fullCm} cm - waiting for it to update.</>
        )}
      </div>

      <div className="flex items-start gap-2 p-3 mt-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs sm:text-sm">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Levels are water depth. 100% ({FULL_SCALE_CM} cm) is the highest level the ultrasonic sensor can
          safely measure: the 19 cm tank minus the 1.2 cm the sensor sits below the rim and 3.8 cm of allowance under it.
        </span>
      </div>
    </Card>
  );
}

const NOTIFY_OPTIONS = [
  { key: 'critical', label: 'Leaks',               hint: 'Leak confirmed in section A or B, or by the level-rate check. Stays on screen until dismissed.' },
  { key: 'warning',  label: 'Warnings',            hint: 'Pump stopped after a dry run, low water, sensor not responding, possible leak being checked.' },
  { key: 'info',     label: 'System messages',     hint: 'Back to normal, pump levels changed, hardware or Digital Twin connected.' },
  { key: 'offline',  label: 'Device offline',      hint: 'The device or Digital Twin stops sending data, and when it comes back.' },
  { key: 'sound',    label: 'Sound',               hint: 'Play the system sound, plus an extra chime for leaks.' },
];

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function NotificationsCard() {
  const prefs = useNotificationPrefs();
  const [permission, setPermission] = useState(notificationPermission);
  const [message, setMessage] = useState(null); // { ok: boolean, text: string }

  const on = prefs.enabled && permission === 'granted';

  const toggleMaster = async (want) => {
    setMessage(null);
    if (!want) { setNotificationPrefs({ enabled: false }); return; }
    let result = permission;
    if (result === 'default') {
      result = await Notification.requestPermission();
      setPermission(result);
    }
    if (result !== 'granted') {
      setMessage({ ok: false, text: 'The browser blocked notifications for this site. Allow them in the site settings (the icon left of the address bar), then try again.' });
      return;
    }
    setNotificationPrefs({ enabled: true });
    if (!showNotification(TEST_NOTIFICATION, { sound: prefs.sound })) {
      setMessage({ ok: false, text: 'This browser does not allow pages to show notifications (Chrome on Android needs the dashboard installed as an app). Use a desktop browser.' });
    }
  };

  const test = () => {
    const ok = showNotification(TEST_NOTIFICATION, { sound: prefs.sound });
    setMessage(ok
      ? { ok: true, text: 'Test sent. If nothing appeared, check that your system lets this browser show notifications (Windows: Settings > System > Notifications; also Focus / Do not disturb).' }
      : { ok: false, text: 'The browser would not show the notification.' });
  };

  return (
    <Card>
      <CardHeader
        title="Notifications"
        icon={BellRing}
        iconColorClass="text-blue-500"
        action={
          <Switch
            checked={on}
            onChange={toggleMaster}
            disabled={permission === 'unsupported'}
            label="Browser notifications"
          />
        }
      />
      <p className="text-xs sm:text-sm text-slate-500 mb-4 leading-relaxed">
        Pop-up notifications on this computer whenever a new alert is raised, even while you are on another tab or app.
        The dashboard must stay open in a browser tab. Saved in this browser only.
      </p>

      {permission === 'unsupported' && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>This browser does not support notifications.</span>
        </div>
      )}
      {permission === 'denied' && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Notifications are blocked for this site. Allow them in the browser's site settings, then reload this page.</span>
        </div>
      )}

      <div className={`divide-y divide-slate-100 ${on ? '' : 'opacity-50'}`}>
        {NOTIFY_OPTIONS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-700">{label}</div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{hint}</p>
            </div>
            <Switch
              checked={prefs[key]}
              onChange={(v) => setNotificationPrefs({ [key]: v })}
              disabled={!on}
              label={label}
            />
          </div>
        ))}
      </div>

      {on && (
        <button
          type="button"
          onClick={test}
          className="mt-4 px-4 py-2 min-h-[40px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
        >
          Send test notification
        </button>
      )}
      {message && (
        <p className={`mt-3 text-xs font-medium ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
    </Card>
  );
}

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

      <NotificationsCard />

      <ThresholdsCard />

    </div>
  );
}
