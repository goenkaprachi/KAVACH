import React, { useState } from 'react';
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
  Menu,
  X,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const WORKSPACE_ITEMS: NavItem[] = [
  { id: 'event-types', label: 'Event Types', icon: Layers },
  { id: 'availability', label: 'Availability', icon: Clock },
  { id: 'bookings', label: 'Meetings', icon: Calendar },
];

const ADMIN_ITEMS: NavItem[] = [
  { id: 'admin-employees', label: 'Employees', icon: Users, adminOnly: true },
  { id: 'admin-bookings', label: 'Org Bookings', icon: ShieldCheck, adminOnly: true },
  { id: 'admin-integrations', label: 'Integrations', icon: Video, adminOnly: true },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const handleSelect = (tab: string) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const active = currentTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleSelect(item.id)}
        className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
          active
            ? 'bg-amber-50 text-amber-950 font-semibold shadow-xs ring-1 ring-amber-200/80'
            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-amber-600" />
        )}
        <Icon
          className={`h-4 w-4 flex-shrink-0 transition-colors ${
            active ? 'text-amber-700' : 'text-slate-400 group-hover:text-slate-600'
          }`}
        />
        <span>{item.label}</span>
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200/80 text-slate-900">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <img
          src="/badge.jpg"
          alt="Kavach Connect"
          className="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-amber-500/20"
        />
        <div>
          <p className="text-base font-bold tracking-tight text-slate-900">Kavach Connect</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Enterprise Scheduling
          </p>
        </div>
        <button
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-5 h-px bg-slate-200/80" />

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <div>
          <p className="mb-2 px-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          <div className="space-y-1">{WORKSPACE_ITEMS.map(renderNavButton)}</div>
        </div>

        {user.role === 'admin' && (
          <div>
            <p className="mb-2 px-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Administration
            </p>
            <div className="space-y-1">{ADMIN_ITEMS.map(renderNavButton)}</div>
          </div>
        )}
      </nav>

      <div className="mx-5 h-px bg-slate-200/80" />

      {/* Footer: timezone + user + logout */}
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2 text-xs text-slate-600">
          <Globe className="h-3.5 w-3.5 text-amber-600" />
          <span className="truncate">{user.timezone}</span>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-100 text-xs font-bold text-amber-800">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <Sparkles className="h-2.5 w-2.5 text-amber-600" />
              {user.role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 text-slate-900 md:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/badge.jpg" alt="Kavach Connect" className="h-8 w-8 rounded-full object-cover shadow-sm" />
          <div>
            <span className="text-sm font-bold text-slate-900">Kavach Connect</span>
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-amber-700">Enterprise</span>
          </div>
        </div>
        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebarContent}</div>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-shrink-0 md:flex">
        {sidebarContent}
      </aside>
    </>
  );
};
