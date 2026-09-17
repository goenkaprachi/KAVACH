import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Clock,
  UserX,
  CheckCircle2,
  AlertTriangle,
  Video,
  Phone,
  MapPin,
  Sparkles,
  Users,
  Layers,
  ArrowUpRight,
  Filter
} from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [scope, setScope] = useState<'all' | 'me'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-summary', timeframe, scope],
    queryFn: async () => {
      const res = await api.get('/analytics/summary', {
        params: { timeframe, scope },
      });
      return res.data;
    },
  });

  const summary = data?.summary || {
    total_bookings: 0,
    confirmed_bookings: 0,
    cancelled_bookings: 0,
    completed_bookings: 0,
    no_show_bookings: 0,
    completion_rate: 100,
    no_show_rate: 0,
    total_meeting_minutes: 0,
    total_meeting_hours: 0,
  };

  const dailyActivity = data?.daily_activity || [];
  const platforms = data?.platform_breakdown || [];
  const dayOfWeek = data?.day_of_week || [];
  const hourly = data?.hourly_distribution || [];
  const hosts = data?.hosts || [];
  const eventTypes = data?.event_types || [];
  const outcomes = data?.outcomes || { successful: 0, needs_followup: 0, no_show: 0, disqualified: 0, unmarked: 0 };
  const followups = data?.followups || { pending: 0, in_progress: 0, completed: 0 };

  const maxDaily = Math.max(...dailyActivity.map((d: any) => d.total), 1);
  const maxDow = Math.max(...dayOfWeek.map((d: any) => d.count), 1);
  const maxHour = Math.max(...hourly.map((h: any) => h.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Analytics & No-Show Intelligence</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive scheduling volume, completion rates, no-show trends, and team metrics
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'admin' && (
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                onClick={() => setScope('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  scope === 'all' ? 'bg-white text-cyan-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Org Wide
              </button>
              <button
                onClick={() => setScope('me')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  scope === 'me' ? 'bg-white text-cyan-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                My Bookings
              </button>
            </div>
          )}

          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            {(['7d', '30d', '90d', 'all'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-all ${
                  timeframe === tf ? 'bg-white text-cyan-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tf === 'all' ? 'All Time' : `Last ${tf.replace('d', ' Days')}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 flex justify-center">
          <div className="h-8 w-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Key Metric Scorecards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Bookings */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Bookings</span>
                <div className="h-8 w-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <Calendar className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{summary.total_bookings}</span>
                <span className="text-xs text-slate-400 font-medium">scheduled</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Confirmed: <strong className="text-slate-800">{summary.confirmed_bookings}</strong></span>
                <span>Cancelled: <strong className="text-slate-800">{summary.cancelled_bookings}</strong></span>
              </div>
            </div>

            {/* Attendance & Completion Rate */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attendance Rate</span>
                <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-emerald-600">{summary.completion_rate}%</span>
                <span className="text-xs text-slate-400 font-medium">completed</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Held Meetings: <strong className="text-emerald-700">{summary.completed_bookings}</strong></span>
                <span className="text-emerald-600 font-medium">Target &gt; 90%</span>
              </div>
            </div>

            {/* No-Show Rate */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">No-Show Rate</span>
                <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <UserX className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold ${summary.no_show_rate > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                  {summary.no_show_rate}%
                </span>
                <span className="text-xs text-slate-400 font-medium">of past calls</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Total No-Shows: <strong className="text-slate-800">{summary.no_show_bookings}</strong></span>
                <span className={summary.no_show_rate > 10 ? 'text-red-500 font-semibold' : 'text-slate-400'}>
                  {summary.no_show_rate > 10 ? 'Attention required' : 'Low risk'}
                </span>
              </div>
            </div>

            {/* Meeting Hours */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Time Booked</span>
                <div className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{summary.total_meeting_hours}</span>
                <span className="text-xs text-slate-400 font-medium">hours</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Total Minutes: <strong className="text-slate-800">{summary.total_meeting_minutes}m</strong></span>
                <span className="text-slate-400">Host face-to-face</span>
              </div>
            </div>
          </div>

          {/* Daily Booking Trend Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Booking Activity Over Time</h3>
                <p className="text-xs text-slate-500 mt-0.5">Daily volume of scheduled and confirmed meetings</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-cyan-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                  <span>Confirmed</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span>Cancelled</span>
                </span>
              </div>
            </div>

            {dailyActivity.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-slate-400">
                No activity data in the selected period.
              </div>
            ) : (
              <div className="pt-4">
                <div className="flex items-end gap-1.5 h-44 w-full">
                  {dailyActivity.map((d: any, idx: number) => {
                    const confirmedH = Math.round((d.confirmed / maxDaily) * 100);
                    const cancelledH = Math.round((d.cancelled / maxDaily) * 100);
                    const isWeekend = new Date(d.date).getDay() === 0 || new Date(d.date).getDay() === 6;
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      >
                        {/* Tooltip */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-slate-900 text-white text-[10px] font-semibold py-1 px-2 rounded-lg whitespace-nowrap shadow-md">
                          {d.date}: {d.confirmed} confirmed{d.cancelled > 0 ? `, ${d.cancelled} cancelled` : ''}
                        </div>

                        {/* Bar */}
                        <div className="w-full max-w-[28px] flex flex-col justify-end gap-0.5 rounded-t-md overflow-hidden bg-slate-100 h-full p-0.5">
                          {cancelledH > 0 && (
                            <div
                              style={{ height: `${cancelledH}%` }}
                              className="w-full bg-slate-300 rounded-xs transition-all"
                            />
                          )}
                          <div
                            style={{ height: `${Math.max(confirmedH, d.total > 0 ? 8 : 0)}%` }}
                            className={`w-full rounded-xs transition-all ${
                              d.confirmed > 0 ? 'bg-gradient-to-t from-cyan-600 to-sky-500' : 'bg-transparent'
                            }`}
                          />
                        </div>

                        {/* Date label */}
                        {(dailyActivity.length <= 14 || idx % Math.ceil(dailyActivity.length / 10) === 0) && (
                          <span className={`text-[10px] mt-1.5 font-medium truncate ${isWeekend ? 'text-slate-400' : 'text-slate-600'}`}>
                            {d.date.slice(5)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Middle Row: Platform Breakdown & Scheduling Patterns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Meeting Platforms */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Meeting Platform Breakdown</h3>
                <p className="text-xs text-slate-500 mt-0.5">Distribution of attendee choice vs configured channels</p>
              </div>

              {platforms.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                  No booking platform records available.
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {platforms.map((p: any) => (
                    <div key={p.provider} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          {p.provider === 'google_meet' ? (
                            <Video className="h-3.5 w-3.5 text-blue-600" />
                          ) : p.provider === 'phone' ? (
                            <Phone className="h-3.5 w-3.5 text-emerald-600" />
                          ) : p.provider === 'in_person' ? (
                            <MapPin className="h-3.5 w-3.5 text-amber-600" />
                          ) : (
                            <Video className="h-3.5 w-3.5 text-cyan-600" />
                          )}
                          <span>{p.label}</span>
                        </span>
                        <span className="text-slate-500 font-medium">
                          {p.count} calls ({p.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${p.percentage}%` }}
                          className="h-full bg-gradient-to-r from-cyan-600 to-sky-500 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Day of Week & Peak Hours */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Peak Scheduling Days</h3>
                <p className="text-xs text-slate-500 mt-0.5">When invitees book calls most frequently</p>
              </div>

              <div className="grid grid-cols-7 gap-2 pt-2">
                {dayOfWeek.map((d: any) => {
                  const pct = Math.round((d.count / maxDow) * 100);
                  return (
                    <div key={d.day} className="flex flex-col items-center gap-1.5">
                      <div className="h-28 w-full bg-slate-50 rounded-xl p-1 flex flex-col justify-end border border-slate-100">
                        <div
                          style={{ height: `${Math.max(pct, d.count > 0 ? 15 : 0)}%` }}
                          className={`w-full rounded-lg transition-all ${
                            d.count > 0 ? 'bg-gradient-to-t from-cyan-600 to-sky-500' : 'bg-transparent'
                          }`}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700">{d.day}</span>
                      <span className="text-[11px] font-medium text-slate-400">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Row: Host Performance & Event Types */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Host Leaderboard */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Host Performance</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Booking volume and completion rates by host</p>
                </div>
                <Users className="h-4 w-4 text-slate-400" />
              </div>

              {hosts.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                  No host records available.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {hosts.map((h: any) => (
                    <div key={h.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-600 to-sky-600 text-white font-bold text-xs flex items-center justify-center">
                          {h.name?.charAt(0) || 'H'}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{h.name}</h4>
                          <p className="text-[11px] text-slate-400">{h.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="block text-xs font-bold text-slate-900">{h.total_bookings}</span>
                          <span className="block text-[10px] text-slate-400">Bookings</span>
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-emerald-600">{h.completion_rate}%</span>
                          <span className="block text-[10px] text-slate-400">Completed</span>
                        </div>
                        <div>
                          <span className={`block text-xs font-bold ${h.no_show_rate > 10 ? 'text-red-600' : 'text-slate-700'}`}>
                            {h.no_show_rate}%
                          </span>
                          <span className="block text-[10px] text-slate-400">No-Show</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Event Types Popularity */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Event Type Popularity</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Most scheduled meeting types across organization</p>
                </div>
                <Layers className="h-4 w-4 text-slate-400" />
              </div>

              {eventTypes.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                  No event type records available.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {eventTypes.map((et: any) => (
                    <div key={et.slug} className="py-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{et.title}</h4>
                        <p className="text-[11px] text-slate-400 font-mono">/{et.slug}</p>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <span className="block text-xs font-bold text-slate-900">{et.count}</span>
                          <span className="block text-[10px] text-slate-400">{et.percentage}% of total</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
