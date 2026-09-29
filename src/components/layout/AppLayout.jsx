import React, { useState, useEffect, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Droplets,
  Activity,
  Power,
  Bell,
  History,
  Settings,
  FlaskConical,
} from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar  from './TopBar';
import DataSourceBanner from './DataSourceBanner';
import { useSwampdsData } from '../../data/swampdsData';

const NAV_ITEMS = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/water-level',  icon: Droplets,        label: 'Water Level'  },
  { to: '/flow-sensors', icon: Activity,        label: 'Flow Sensors' },
  { to: '/pump-status',  icon: Power,           label: 'Pump Status'  },
  { to: '/alerts',       icon: Bell,            label: 'Alerts'       },
  { to: '/history',      icon: History,         label: 'Pumping History' },
  { to: '/settings',     icon: Settings,        label: 'Settings'     },
  { to: '/twin',         icon: FlaskConical,    label: 'Digital Twin', external: true },
];

const ROUTE_TITLES = {
  '/dashboard':    'Dashboard',
  '/water-level':  'Water Level',
  '/flow-sensors': 'Flow Sensors',
  '/pump-status':  'Pump Status',
  '/alerts':       'Alerts',
  '/history':      'Pumping History',
  '/settings':     'Settings',
};

/**
 * Root shell for all authenticated pages.
 * Responsive layout: drawer on mobile (<768px), persistent sidebar on desktop (>=768px).
 */
export default function AppLayout() {
  const { pathname } = useLocation();
  const { alerts, status, loaded, meta } = useSwampdsData();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Automatically close mobile drawer whenever the user navigates
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Fire a browser notification when systemStatus worsens
  const prevStatusRef = React.useRef(null);
  useEffect(() => {
    // Wait for the first real Firebase snapshot - the placeholder 'normal' state
    // would otherwise look like a change and fire a false notification on load
    if (!loaded) return;

    const current = status?.systemStatus;
    const prev    = prevStatusRef.current;

    // First real snapshot: record it as the baseline, don't notify
    if (prev === null) {
      prevStatusRef.current = current;
      return;
    }

    if (current !== prev) {
      prevStatusRef.current = current;

      if ('Notification' in window && Notification.permission === 'granted') {
        const messages = {
          warning: { title: 'SWAMPDS - Warning',       body: 'The system needs attention. Check the alerts.' },
          leak:    { title: 'SWAMPDS - Leak Detected', body: 'Leak confirmed between Flow Sensor 1 and 2. Inspect the pipeline immediately.' },
          fault:   { title: 'SWAMPDS - Sensor Fault',  body: 'A flow sensor is reading near zero. Manual inspection required.' },
          normal:  { title: 'SWAMPDS - All Clear',     body: 'System has returned to normal operation.' },
        };
        const msg = messages[current];
        if (msg) {
          new Notification(msg.title, {
            body: msg.body,
            icon: '/favicon.svg',
            tag:  'swampds-status', // replaces previous notification instead of stacking
          });
        }
      }
    }
  }, [loaded, status?.systemStatus]);

  // Fire a browser notification when the Digital Twin connects to / disconnects from the
  // dashboard - the "Simulated data" banner is easy to miss if you're not looking at the page.
  const prevTwinRef = React.useRef(null);
  useEffect(() => {
    if (!loaded) return;

    const connected = meta?.source === 'digital-twin' && meta?.online === true;
    const prev = prevTwinRef.current;

    // First real snapshot: record it as the baseline, don't notify
    if (prev === null) {
      prevTwinRef.current = connected;
      return;
    }

    if (connected !== prev) {
      prevTwinRef.current = connected;

      if ('Notification' in window && Notification.permission === 'granted') {
        const msg = connected
          ? { title: 'SWAMPDS - Digital Twin Connected', body: 'This dashboard is now showing simulated data from the Digital Twin.' }
          : { title: 'SWAMPDS - Digital Twin Disconnected', body: 'The Digital Twin has stopped publishing. Data may be stale.' };
        new Notification(msg.title, {
          body: msg.body,
          icon: '/favicon.svg',
          tag:  'swampds-twin', // replaces previous notification instead of stacking
        });
      }
    }
  }, [loaded, meta?.source, meta?.online]);

  const pageTitle  = ROUTE_TITLES[pathname] ?? 'SWAMPDS';
  const alertCount = alerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar
        navItems={NAV_ITEMS}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          title={pageTitle}
          alertCount={alertCount}
          onMenuClick={() => setSidebarOpen(prev => !prev)}
        />
        <DataSourceBanner meta={meta} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Keep the sidebar/top bar on screen while a lazy page loads */}
          <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
