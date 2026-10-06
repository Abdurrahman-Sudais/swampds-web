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
import { useAuth } from '../../auth/AuthContext';
import { useUnreadAlerts } from './useUnreadAlerts';
import { useAlertNotifications } from './useAlertNotifications';
import { PageSkeleton } from '../skeleton/Skeleton';
import BackgroundTwin from '../../twin/BackgroundTwin';
import { TWIN_LINK_ENABLED } from '../../twin/config.js';

// How long to hold the skeleton for the first Firebase snapshot before showing the page anyway
// (with its empty values and the offline banner) rather than leaving it loading forever.
const FIRST_DATA_WAIT_MS = 8000;

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
  const { alerts, alertsLoaded, loaded, meta } = useSwampdsData();
  const { user, canEdit } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadCount, markSeen } = useUnreadAlerts(alerts, user?.uid);

  // Looking at the alerts page counts as reading them - including ones that arrive while it's open
  useEffect(() => {
    if (pathname === '/alerts') markSeen();
  }, [pathname, markSeen]);

  // Show a skeleton, not placeholder zeros, until the first real data arrives
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const id = setTimeout(() => setWaitedOut(true), FIRST_DATA_WAIT_MS);
    return () => clearTimeout(id);
  }, [loaded]);
  const awaitingData = !loaded && !waitedOut;

  // Automatically close mobile drawer whenever the user navigates
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Browser notifications for new alerts and the device going offline (switched on in Settings)
  useAlertNotifications({ alerts, alertsLoaded, loaded, meta });

  const pageTitle  = ROUTE_TITLES[pathname] ?? 'SWAMPDS';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Admins only: the database rules let only admins publish as the twin */}
      {TWIN_LINK_ENABLED && canEdit && <BackgroundTwin />}
      <Sidebar
        navItems={NAV_ITEMS}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          title={pageTitle}
          unreadCount={unreadCount}
          onAlertsClick={markSeen}
          onMenuClick={() => setSidebarOpen(prev => !prev)}
        />
        <DataSourceBanner meta={meta} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Keep the sidebar/top bar on screen while a lazy page loads */}
          <Suspense fallback={<PageSkeleton pathname={pathname} />}>
            {awaitingData ? <PageSkeleton pathname={pathname} /> : <Outlet />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
