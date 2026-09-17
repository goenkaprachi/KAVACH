import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import {
  Calendar,
  Clock,
  Users,
  Video,
  Layers,
  LogOut,
  ShieldCheck,
  Globe,
  X,
  Sparkles,
  LayoutDashboard,
  ChevronsUpDown,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  History,
} from 'lucide-react';

const KAVACH_SIDEBAR_COLLAPSED_KEY = 'kavach_sidebar_collapsed_categories_v1';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  badge?: string;
  badgeColor?: string;
}

export interface NavCategory {
  id: string;
  label: string;
  items: NavItem[];
}

const navCategories: NavCategory[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { to: '/meetings/upcoming', label: 'Upcoming Meetings', icon: Calendar },
      { to: '/meetings/past', label: 'Past Meetings', icon: History },
      { to: '/event-types', label: 'Event Types', icon: Layers },
      { to: '/availability', label: 'Availability', icon: Clock },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { to: '/admin/employees', label: 'Employees', icon: Users, adminOnly: true },
      { to: '/admin/bookings', label: 'Org Bookings', icon: ShieldCheck, adminOnly: true },
      { to: '/admin/integrations', label: 'Integrations', icon: Video, adminOnly: true },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen,
  onCloseMobile,
  isMinimized,
  onToggleMinimize,
}) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Category collapsed state
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(KAVACH_SIDEBAR_COLLAPSED_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse sidebar categories state', e);
    }
    return {};
  });

  const toggleCategory = (catId: string) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [catId]: !prev[catId] };
      try {
        localStorage.setItem(KAVACH_SIDEBAR_COLLAPSED_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save sidebar category state', e);
      }
      return next;
    });
  };

  const areAllCollapsed = navCategories.every((cat) => collapsedMap[cat.id] === true);
  const toggleAllCategories = () => {
    const nextState = !areAllCollapsed;
    const next: Record<string, boolean> = {};
    navCategories.forEach((cat) => {
      next[cat.id] = nextState;
    });
    setCollapsedMap(next);
    try {
      localStorage.setItem(KAVACH_SIDEBAR_COLLAPSED_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save categories', e);
    }
  };

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleCategories = navCategories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => !item.adminOnly || user.role === 'admin'),
    }))
    .filter((cat) => cat.items.length > 0);

  // Render navigation in minimized (icon-only with tooltips) or full mode
  const renderNav = (minimizedMode: boolean) => {
    if (minimizedMode) {
      return (
        <div className="flex-1 overflow-y-auto space-y-3 py-2 custom-scrollbar">
          {visibleCategories.map((cat) => (
            <div key={cat.id} className="space-y-1">
              <div className="w-5 h-0.5 bg-slate-200 mx-auto my-2 rounded-full" />
              <div className="space-y-1">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    location.pathname === item.to ||
                    (item.to !== '/dashboard' && location.pathname.startsWith(item.to));

                  return (
                    <div key={item.to} className="relative group flex justify-center">
                      <NavLink
                        to={item.to}
                        end={item.to === '/dashboard'}
                        onClick={onCloseMobile}
                        className={`flex items-center justify-center h-10 w-10 rounded-xl transition-all duration-150 ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-600 border border-cyan-500/40 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                      </NavLink>

                      {/* Floating Tooltip inspired by Orion */}
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md text-white border border-slate-700/60 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 pointer-events-none whitespace-nowrap">
                        <div className="text-xs font-bold flex items-center gap-2">
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-black bg-cyan-500 text-slate-950">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">{cat.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Navigation Menu
          </span>
          <button
            type="button"
            onClick={toggleAllCategories}
            className="text-[10px] font-bold text-slate-400 hover:text-cyan-600 transition-colors flex items-center gap-1 cursor-pointer"
            title={areAllCollapsed ? 'Expand all categories' : 'Collapse all categories'}
          >
            <ChevronsUpDown className="h-3 w-3" />
            <span>{areAllCollapsed ? 'Expand All' : 'Collapse All'}</span>
          </button>
        </div>

        <nav className="space-y-3">
          {visibleCategories.map((cat) => {
            const isCollapsed = collapsedMap[cat.id] === true;
            const hasActiveChild = cat.items.some(
              (item) =>
                location.pathname === item.to ||
                (item.to !== '/dashboard' && location.pathname.startsWith(item.to))
            );

            return (
              <div key={cat.id} className="space-y-1">
                {/* Category Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10.5px] font-extrabold tracking-wider uppercase transition-all duration-150 select-none cursor-pointer group ${
                    hasActiveChild
                      ? 'text-cyan-700 bg-cyan-50/70'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{cat.label}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-200/70 text-slate-600">
                      {cat.items.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transform transition-transform duration-200 ${
                      isCollapsed ? '-rotate-90' : 'rotate-0'
                    }`}
                  />
                </button>

                {/* Category Items List */}
                <div
                  className={`space-y-0.5 pl-1 transition-all duration-200 ease-in-out ${
                    isCollapsed ? 'max-h-0 opacity-0 overflow-hidden pointer-events-none' : 'max-h-96 opacity-100'
                  }`}
                >
                  {cat.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      location.pathname === item.to ||
                      (item.to !== '/dashboard' && location.pathname.startsWith(item.to));

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/dashboard'}
                        onClick={onCloseMobile}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 group ${
                          isActive
                            ? 'bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-indigo-500/5 text-cyan-700 font-bold border border-cyan-500/30 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors ${
                              isActive
                                ? 'text-cyan-600'
                                : 'text-slate-400 group-hover:text-slate-600'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>

                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${
                              item.badgeColor || 'bg-cyan-500/10 text-cyan-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200/90 text-slate-900 select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/badge.jpg"
            alt="Kavach"
            className="h-9 w-9 rounded-full object-cover shadow-xs ring-2 ring-cyan-500/20 shrink-0"
          />
          {!isMinimized && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold tracking-tight text-slate-900 truncate">
                Kavach Connect
              </p>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-cyan-700">
                Enterprise Scheduling
              </p>
            </div>
          )}
        </div>

        {/* Toggle / Close button */}
        {!isMinimized ? (
          <button
            type="button"
            onClick={onToggleMinimize}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Minimize Sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleMinimize}
            className="hidden md:flex mx-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Expand Sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
          onClick={onCloseMobile}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav Content */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        {renderNav(isMinimized)}
      </div>

      {/* Footer Profile / Timezone */}
      <div className="border-t border-slate-100 p-3 bg-slate-50/60 shrink-0">
        {!isMinimized ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200/80 px-2.5 py-1.5 text-[11px] text-slate-600 shadow-2xs">
              <Globe className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
              <span className="truncate">{user.timezone}</span>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl bg-white border border-slate-200/90 p-2 shadow-2xs">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-100 text-xs font-bold text-cyan-800">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{user.name}</p>
                <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  <Sparkles className="h-2 w-2 text-cyan-600" />
                  {user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-100 text-xs font-bold text-cyan-800"
              title={`${user.name} (${user.role})`}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex flex-col w-72 max-w-full bg-white shadow-2xl z-10 h-full animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Sticky Minimizable Sidebar */}
      <aside
        className={`hidden md:flex h-screen sticky top-0 shrink-0 z-20 transition-all duration-300 ease-in-out ${
          isMinimized ? 'w-18 min-w-[4.5rem] max-w-[4.5rem]' : 'w-64 min-w-[16rem] max-w-[16rem]'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};
