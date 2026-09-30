import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, Calendar, Clock, Menu } from 'lucide-react';

/**
 * @param {{ title: string, unreadCount?: number, onAlertsClick?: () => void, onMenuClick?: () => void }} props
 *   unreadCount: alerts that arrived since the user last opened them - drives the red dot
 */
export default function TopBar({ title, unreadCount = 0, onAlertsClick, onMenuClick }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 mr-3">
        <button
          className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] flex-shrink-0"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-2 sm:gap-5 text-xs sm:text-sm text-slate-600 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>
            {now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg sm:bg-transparent sm:p-0">
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
          <span className="font-medium text-slate-700">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <NavLink
          to="/alerts"
          className="relative p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          onClick={onAlertsClick}
          aria-label={unreadCount > 0 ? `View alerts (${unreadCount} new)` : 'View alerts'}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute top-2 right-2 flex w-2.5 h-2.5">
              {/* One soft ping when new alerts land, then a steady dot until they're opened */}
              <span className="absolute inset-0 rounded-full bg-red-400 opacity-75 animate-ping [animation-iteration-count:2] motion-reduce:hidden" />
              <span className="relative w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
            </span>
          )}
        </NavLink>
      </div>
    </header>
  );
}
