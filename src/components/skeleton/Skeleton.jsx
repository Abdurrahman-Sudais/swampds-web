import React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Droplets } from 'lucide-react';

/**
 * Loading placeholders shaped like the real UI, so the page doesn't jump when data arrives.
 * Every page skeleton mirrors its page's grid (same columns, gaps and breakpoints).
 * Blocks are aria-hidden; the wrapper announces "Loading…" once to screen readers.
 */

/** One shimmering block. `dark` is for placeholders on the navy sidebar / login panel. */
export const Skeleton = ({ className, dark = false }) => (
  <div aria-hidden="true" className={twMerge(clsx('skeleton rounded-md', dark && 'skeleton-dark', className))} />
);

/** Region wrapper: tells assistive tech the area is busy without reading out every block. */
const Busy = ({ className, children }) => (
  <div role="status" aria-busy="true" aria-live="polite" className={className}>
    <span className="sr-only">Loading…</span>
    {children}
  </div>
);

/** Same box as <Card>, with a placeholder header (icon + title). */
const SkeletonCard = ({ className, header = true, children }) => (
  <div className={twMerge(clsx('bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5', className))}>
    {header && (
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="w-5 h-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    )}
    {children}
  </div>
);

const Lines = ({ count = 3, className }) => (
  <div className={twMerge(clsx('space-y-2.5', className))}>
    {Array.from({ length: count }, (_, i) => (
      // Last line shorter, like a real paragraph
      <Skeleton key={i} className={clsx('h-3', i === count - 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);

/** Alert / event row: icon, badge + time, message. */
const ListRows = ({ count = 4 }) => (
  <div className="divide-y divide-slate-50">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex gap-3 items-start py-3.5">
        <Skeleton className="w-5 h-5 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className={clsx('h-3', i % 2 ? 'w-3/4' : 'w-11/12')} />
        </div>
      </div>
    ))}
  </div>
);

const Chart = ({ className = 'h-56 sm:h-64' }) => (
  <SkeletonCard>
    <Skeleton className={twMerge(clsx('w-full rounded-xl', className))} />
  </SkeletonCard>
);

/** KPI tile: label, big number, small sparkline/control area. */
const StatCard = ({ className }) => (
  <SkeletonCard className={className}>
    <Skeleton className="h-9 w-24 mb-3" />
    <Skeleton className="h-3 w-32 mb-4" />
    <Skeleton className="h-10 w-full rounded-lg" />
  </SkeletonCard>
);

const Banner = () => <Skeleton className="h-16 w-full rounded-2xl" />;

/** Rows of table cells, for the pumping session log. */
export const TableRowsSkeleton = ({ rows = 5, cols = 4 }) => (
  <div aria-hidden="true" className="space-y-4 py-1">
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={clsx('h-4', c === 0 ? 'w-4/5' : 'w-3/5')} />
        ))}
      </div>
    ))}
  </div>
);

// ── Page skeletons (one per route) ──

const DashboardSkeleton = () => (
  <div className="space-y-6">
    <Banner />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {[0, 1, 2, 3].map(i => <StatCard key={i} />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="lg:col-span-2 space-y-4 sm:space-y-6">
        <Chart />
        <Chart />
      </div>
      <SkeletonCard><ListRows count={6} /></SkeletonCard>
    </div>
  </div>
);

const WaterLevelSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      <StatCard className="sm:col-span-2 lg:col-span-1" />
      <SkeletonCard><Skeleton className="h-6 w-28 mb-3" /><Skeleton className="h-3 w-36" /></SkeletonCard>
      <SkeletonCard className="sm:col-span-2 lg:col-span-2"><Lines count={3} /></SkeletonCard>
    </div>
    <Chart />
  </div>
);

const FlowSensorsSkeleton = () => (
  <div className="space-y-6">
    <Banner />
    <Chart className="h-44 sm:h-48" />
    <Chart className="h-44 sm:h-48" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <SkeletonCard><Lines count={4} /></SkeletonCard>
      <SkeletonCard><Lines count={4} /></SkeletonCard>
    </div>
  </div>
);

const PumpStatusSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <SkeletonCard>
        <div className="flex flex-col items-center gap-4 py-2">
          <Skeleton className="w-24 h-24 rounded-full" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </SkeletonCard>
      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <SkeletonCard><Skeleton className="h-9 w-28 mb-3" /><Skeleton className="h-3 w-40" /></SkeletonCard>
        <SkeletonCard><Skeleton className="h-11 w-full rounded-xl mb-3" /><Skeleton className="h-3 w-40" /></SkeletonCard>
      </div>
    </div>
    <SkeletonCard><ListRows count={4} /></SkeletonCard>
  </div>
);

const AlertsSkeleton = () => (
  <div className="space-y-6">
    <div className="flex gap-2.5 sm:gap-3">
      <Skeleton className="h-8 w-24 rounded-xl" />
      <Skeleton className="h-8 w-24 rounded-xl" />
      <Skeleton className="h-8 w-20 rounded-xl" />
    </div>
    <SkeletonCard header={false}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-12 w-full sm:w-80 rounded-xl" />
      </div>
      <ListRows count={6} />
    </SkeletonCard>
  </div>
);

const HistorySkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <SkeletonCard className="lg:col-span-2">
        <Skeleton className="h-3 w-48 mb-6" />
        <TableRowsSkeleton rows={6} />
      </SkeletonCard>
      <SkeletonCard><ListRows count={5} /></SkeletonCard>
    </div>
  </div>
);

const SettingsSkeleton = () => (
  <div className="space-y-6 max-w-2xl">
    <SkeletonCard>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    </SkeletonCard>
    <SkeletonCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-4">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <Lines count={2} />
    </SkeletonCard>
  </div>
);

const PAGE_SKELETONS = {
  '/dashboard':    DashboardSkeleton,
  '/water-level':  WaterLevelSkeleton,
  '/flow-sensors': FlowSensorsSkeleton,
  '/pump-status':  PumpStatusSkeleton,
  '/alerts':       AlertsSkeleton,
  '/history':      HistorySkeleton,
  '/settings':     SettingsSkeleton,
};

/** Content-area placeholder for the given route (falls back to the dashboard shape). */
export function PageSkeleton({ pathname }) {
  const Page = PAGE_SKELETONS[pathname] ?? DashboardSkeleton;
  return <Busy><Page /></Busy>;
}

/** The whole signed-in shell (sidebar, top bar, page) for first load, before auth / layout exist. */
export function AppShellSkeleton({ pathname }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className="hidden md:flex w-64 bg-[#0B1120] flex-col flex-shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <Droplets className="w-8 h-8 text-blue-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-xl tracking-tight leading-none text-white">SWAMPDS</p>
            <Skeleton dark className="h-2.5 w-28 mt-2" />
          </div>
        </div>
        <div className="flex-1 px-4 py-4 space-y-1">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton dark className="w-5 h-5 rounded-md" />
              <Skeleton dark className={clsx('h-3.5', i % 3 === 0 ? 'w-28' : i % 3 === 1 ? 'w-20' : 'w-24')} />
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
            <Skeleton dark className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton dark className="h-3 w-20" />
              <Skeleton dark className="h-2.5 w-32" />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Skeleton className="md:hidden w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-32 sm:w-40" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="hidden sm:block h-4 w-24" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="w-6 h-6 rounded-full" />
          </div>
        </header>
        <main className="flex-1 overflow-hidden p-4 sm:p-6">
          <PageSkeleton pathname={pathname} />
        </main>
      </div>
    </div>
  );
}

/** Sign-in page placeholder: brand panel on desktop, form card. */
export function LoginSkeleton() {
  return (
    <Busy className="min-h-screen flex font-sans bg-slate-50">
      <div className="hidden md:flex w-80 bg-[#0B1120] flex-col p-8 lg:p-10 flex-shrink-0 gap-10">
        <div className="flex items-center gap-3">
          <Droplets className="w-8 h-8 text-blue-500" />
          <p className="font-bold text-xl text-white tracking-tight leading-none">SWAMPDS</p>
        </div>
        <div className="space-y-3 mt-auto mb-auto">
          <Skeleton dark className="h-5 w-48" />
          <Skeleton dark className="h-3 w-full" />
          <Skeleton dark className="h-3 w-5/6" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </Busy>
  );
}

/** Generic public-page placeholder (the Digital Twin): header bar and a content grid. */
export function PublicPageSkeleton() {
  return (
    <Busy className="min-h-screen bg-slate-50 font-sans">
      <div className="h-14 bg-white border-b border-slate-200" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Skeleton className="lg:col-span-2 h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </Busy>
  );
}
