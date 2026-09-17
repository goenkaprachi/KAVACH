import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { Sidebar } from './Sidebar';
import { TopLoadingBar } from './TopLoadingBar';
import {
  Menu,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Compass,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Sparkles,
  Globe,
  User,
  Calendar,
  Layers,
} from 'lucide-react';

const KAVACH_SIDEBAR_MINIMIZED_KEY = 'kavach_sidebar_minimized_state';

const ROUTE_LABELS: Record<string, { title: string; subtitle: string; category: string }> = {
  '/dashboard': {
    title: 'Overview',
    subtitle: 'High-level activity, quick metrics, and schedule summary',
    category: 'Workspace',
  },
  '/meetings/upcoming': {
    title: 'Upcoming Meetings',
    subtitle: 'Real-time active calls, incoming client appointments & instant join links',
    category: 'Workspace',
  },
  '/meetings/past': {
    title: 'Past & Completed Meetings',
    subtitle: 'Historical appointment records, cancellation logs, attendee dossiers & audit trail',
    category: 'Workspace',
  },
  '/meetings': {
    title: 'Meetings',
    subtitle: 'Scheduled appointments, attendee contact records & change logs',
    category: 'Workspace',
  },
  '/event-types': {
    title: 'Event Types',
    subtitle: 'Configure booking lengths, video platforms, and custom questions',
    category: 'Workspace',
  },
  '/availability': {
    title: 'Availability',
    subtitle: 'Set weekly business hours, overrides, and calendar limits',
    category: 'Workspace',
  },
  '/admin/employees': {
    title: 'Employee Management',
    subtitle: 'Invite team members, assign booking roles, and monitor status',
    category: 'Administration',
  },
  '/admin/bookings': {
    title: 'Organization Bookings',
    subtitle: 'Audit trail and administrative control across all staff bookings',
    category: 'Administration',
  },
  '/admin/integrations': {
    title: 'System Integrations',
    subtitle: 'Manage video conferencing, calendar sync, and automation credentials',
    category: 'Administration',
  },
};

export const AppShell: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Minimized sidebar state persisted in localStorage (like Orion)
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KAVACH_SIDEBAR_MINIMIZED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KAVACH_SIDEBAR_MINIMIZED_KEY, String(next));
      } catch (e) {
        console.warn('Failed to save minimize state', e);
      }
      return next;
    });
  };

  // Close user dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentRouteMeta = ROUTE_LABELS[location.pathname] || {
    title: 'Dashboard',
    subtitle: 'Enterprise Scheduling System',
    category: 'Workspace',
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 transition-colors duration-200">
      {/* Top Transition Progress Bar (Orion style) */}
      <TopLoadingBar />

      {/* Sidebar with Minimize & Mobile Drawer */}
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        isMinimized={isMinimized}
        onToggleMinimize={toggleSidebarMinimize}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto overflow-x-hidden bg-slate-50">
        {/* Sticky Glassmorphic Top Header Bar */}
        <header className="h-14 bg-white/85 backdrop-blur-md border-b border-slate-200/90 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Desktop Sidebar Toggle Button */}
            <button
              type="button"
              onClick={toggleSidebarMinimize}
              className="hidden md:flex p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              title={isMinimized ? 'Expand Sidebar' : 'Minimize Sidebar'}
            >
              {isMinimized ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            {/* Mobile Hamburger Trigger */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 md:hidden hover:bg-slate-100 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Breadcrumb Trail (Orion style) */}
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="font-extrabold text-slate-800 hidden sm:inline shrink-0 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-cyan-600 inline shrink-0" />
                Kavach Connect
              </span>
              <span className="text-slate-300 hidden sm:inline shrink-0">/</span>
              <span className="font-semibold text-cyan-600 flex items-center gap-1.5 truncate max-w-[150px] sm:max-w-none">
                <Compass className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                <span className="truncate">{currentRouteMeta.title}</span>
              </span>
            </div>
          </div>

          {/* Top Right Controls & User Profile Popover */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {/* Public Booking Link Badge Button */}
            {user.username && (
              <a
                href={`/${user.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-cyan-800 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl transition-all shadow-2xs"
                title="View your public booking calendar"
              >
                <span>Booking Link</span>
                <ExternalLink className="h-3 w-3 text-cyan-600" />
              </a>
            )}

            {/* User Profile Dropdown Pill (Orion style) */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className={`flex items-center space-x-2.5 p-1 sm:px-2.5 sm:py-1 rounded-2xl border transition-all duration-200 select-none cursor-pointer group ${
                  userDropdownOpen
                    ? 'bg-cyan-50 border-cyan-300 shadow-sm'
                    : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="relative flex items-center justify-center h-7 w-7 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-500 text-white font-black text-xs shadow-xs">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="h-7 w-7 rounded-xl object-cover"
                    />
                  ) : (
                    <span>{user.name?.charAt(0)?.toUpperCase()}</span>
                  )}
                </div>

                <div className="hidden sm:flex flex-col items-start text-left leading-tight min-w-0 max-w-[120px]">
                  <span className="text-xs font-bold text-slate-800 truncate w-full">
                    {user.name}
                  </span>
                  <span className="text-[10px] font-semibold text-cyan-600 capitalize truncate w-full">
                    {user.role}
                  </span>
                </div>
              </button>

              {/* Popover Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200/90 shadow-2xl p-2 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                  <div className="p-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Globe className="h-3 w-3 text-amber-600 shrink-0" />
                      <span className="truncate">{user.timezone}</span>
                    </div>
                  </div>

                  <div className="p-1 space-y-0.5">
                    {user.username && (
                      <a
                        href={`/${user.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-amber-600" />
                        <span>Public Booking Page</span>
                      </a>
                    )}

                    <Link
                      to="/meetings/upcoming"
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>My Meetings</span>
                    </Link>

                    <Link
                      to="/event-types"
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      <Layers className="h-3.5 w-3.5 text-slate-400" />
                      <span>Event Types</span>
                    </Link>
                  </div>

                  <div className="p-1 border-t border-slate-100 mt-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5 text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Outlet with subtle enter animation */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
