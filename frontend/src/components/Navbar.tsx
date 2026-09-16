import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { 
  Calendar, 
  Clock, 
  Users, 
  Video, 
  Layers, 
  LogOut, 
  ShieldCheck, 
  User as UserIcon,
  Globe
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('event-types')}>
              <img
                src="/badge.jpg"
                alt="Kavach Connect"
                className="h-10 w-10 rounded-full object-cover shadow-sm border border-amber-900/20"
              />
              <div>
                <span className="text-lg font-bold tracking-tight text-slate-900">Kavach Connect</span>
                <span className="block text-[10px] text-slate-500 font-medium tracking-wide uppercase">Enterprise Scheduling</span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex space-x-1">
              <button
                onClick={() => onTabChange('event-types')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentTab === 'event-types'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Event Types</span>
              </button>

              <button
                onClick={() => onTabChange('availability')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentTab === 'availability'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Clock className="h-4 w-4" />
                <span>Availability</span>
              </button>

              <button
                onClick={() => onTabChange('bookings')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentTab === 'bookings'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>Meetings</span>
              </button>

              {user.role === 'admin' && (
                <>
                  <div className="h-6 w-px bg-slate-200 my-auto mx-1" />
                  <button
                    onClick={() => onTabChange('admin-employees')}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentTab === 'admin-employees'
                        ? 'bg-purple-50 text-purple-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    <span>Employees</span>
                  </button>

                  <button
                    onClick={() => onTabChange('admin-bookings')}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentTab === 'admin-bookings'
                        ? 'bg-purple-50 text-purple-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Org Bookings</span>
                  </button>

                  <button
                    onClick={() => onTabChange('admin-integrations')}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentTab === 'admin-integrations'
                        ? 'bg-purple-50 text-purple-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Video className="h-4 w-4" />
                    <span>Integrations</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-full">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <span>{user.timezone}</span>
            </div>

            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-medium text-slate-700 text-xs">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="hidden lg:block text-left">
                <span className="block text-xs font-semibold text-slate-900">{user.name}</span>
                <span className="block text-[10px] text-slate-500 capitalize">{user.role}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
