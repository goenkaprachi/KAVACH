import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { format, parseISO, isPast, isFuture } from 'date-fns';
import {
  Calendar,
  Clock,
  Layers,
  Users,
  ArrowRight,
  Quote,
  CheckCircle2,
  Radio,
  Sparkles,
  Zap,
  CalendarPlus,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';

const THOUGHTS = [
  { thought: 'The key is not to prioritize what is on your schedule, but to schedule your priorities.', author: 'Stephen Covey' },
  { thought: 'Until we can manage time, we can manage nothing else.', author: 'Peter Drucker' },
  { thought: 'Time is what we want most, but what we use worst.', author: 'William Penn' },
  { thought: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { thought: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Peter Drucker' },
  { thought: 'Small daily improvements are the key to staggering long-term results.', author: 'James Clear' },
  { thought: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
];

const getDayOfYear = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
};

const getGreeting = (h: number) => {
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Working late';
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings-dashboard'],
    queryFn: async () => (await api.get('/bookings', { params: { limit: 200 } })).data,
  });

  const { data: eventTypes = [] } = useQuery({
    queryKey: ['event-types-dashboard'],
    queryFn: async () => (await api.get('/event-types')).data,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['admin-employees-dashboard'],
    queryFn: async () => (await api.get('/admin/employees')).data,
    enabled: user?.role === 'admin',
  });

  const cleanBookings = useMemo(
    () =>
      bookings.filter(
        (b: any) =>
          !(b.status === 'cancelled' && b.cancellation_reason?.startsWith('Rescheduled'))
      ),
    [bookings]
  );

  const upcoming = useMemo(
    () => cleanBookings.filter((b: any) => b.status === 'confirmed' && isFuture(parseISO(b.end_time))),
    [cleanBookings]
  );

  const live = useMemo(
    () => upcoming.filter((b: any) => isPast(parseISO(b.start_time))),
    [upcoming]
  );

  const todayMeetings = useMemo(
    () =>
      upcoming.filter((b: any) => {
        const d = parseISO(b.start_time);
        return d.toDateString() === now.toDateString();
      }),
    [upcoming, now]
  );

  const past = useMemo(
    () => cleanBookings.filter((b: any) => b.status === 'confirmed' && isPast(parseISO(b.end_time))),
    [cleanBookings]
  );

  const thought = THOUGHTS[getDayOfYear(now) % THOUGHTS.length];
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const currentDate = format(now, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(now, 'hh:mm:ss a');

  const stats = [
    {
      label: 'Upcoming Meetings',
      value: upcoming.length,
      icon: Calendar,
      gradient: 'from-cyan-600 to-sky-600',
      shadow: 'shadow-cyan-500/20',
      border: 'border-cyan-500/20',
      link: '/meetings/upcoming',
      detail: `${todayMeetings.length} scheduled for today`,
    },
    {
      label: "Today's Schedule",
      value: todayMeetings.length,
      icon: Clock,
      gradient: 'from-indigo-600 to-purple-600',
      shadow: 'shadow-indigo-500/20',
      border: 'border-indigo-500/20',
      link: '/meetings/upcoming',
      detail: live.length > 0 ? `${live.length} active right now` : 'All slots clear',
    },
    {
      label: 'Active Event Types',
      value: eventTypes.length,
      icon: Layers,
      gradient: 'from-blue-600 to-indigo-600',
      shadow: 'shadow-blue-500/20',
      border: 'border-blue-500/20',
      link: '/event-types',
      detail: 'Configured booking templates',
    },
    user?.role === 'admin'
      ? {
          label: 'Team Directory',
          value: employees.length,
          icon: Users,
          gradient: 'from-emerald-600 to-teal-600',
          shadow: 'shadow-emerald-500/20',
          border: 'border-emerald-500/20',
          link: '/admin/employees',
          detail: 'Active staff members',
        }
      : {
          label: 'Completed Sessions',
          value: past.length,
          icon: CheckCircle2,
          gradient: 'from-emerald-600 to-teal-600',
          shadow: 'shadow-emerald-500/20',
          border: 'border-emerald-500/20',
          link: '/meetings/past',
          detail: 'Successfully held meetings',
        },
  ];

  const quickLinks = [
    {
      to: '/meetings/upcoming',
      label: 'My Meetings',
      icon: Calendar,
      desc: 'Browse schedule, view attendee notes, and access video links',
      badge: `${upcoming.length} active`,
    },
    {
      to: '/event-types',
      label: 'Event Types',
      icon: Layers,
      desc: 'Customize appointment durations, platforms, and booking fields',
      badge: `${eventTypes.length} types`,
    },
    {
      to: '/availability',
      label: 'Weekly Availability',
      icon: Clock,
      desc: 'Define operating hours, timezone rules, and buffer periods',
      badge: 'Manage hours',
    },
    ...(user?.role === 'admin'
      ? [
          {
            to: '/admin/employees',
            label: 'Employee Directory',
            icon: Users,
            desc: 'Provision staff member accounts and configure permissions',
            badge: 'Admin',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* ── Orion Hero Greeting Card ────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-indigo-500/10 border border-cyan-500/20 shadow-sm transition-all">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-cyan-500/20 text-cyan-800 border border-cyan-500/30">
                {user?.role === 'admin' ? 'Enterprise Administrator' : 'Staff Member'}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              {getGreeting(now.getHours())},{' '}
              <span className="gradient-text">{firstName}</span> 👋
            </h1>
            <p className="text-xs md:text-sm text-slate-600 mt-1.5 max-w-2xl leading-relaxed">
              Welcome to <span className="font-semibold text-cyan-700">Kavach Connect</span> • Enterprise appointment scheduling, automated calendar coordination, and meeting intelligence.
            </p>
          </div>

          {/* Right Side: Live Date & Time Widget (Exact from Orion) */}
          <div className="flex items-center space-x-3.5 shrink-0 bg-transparent">
            <div className="h-11 w-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 shadow-sm">
              <Clock className="h-5.5 w-5.5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-600">
                <Calendar className="h-3.5 w-3.5 text-cyan-600" />
                <span>{currentDate}</span>
              </div>
              <div className="flex items-center space-x-2 text-base md:text-lg font-mono font-extrabold text-slate-900">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="tracking-tight">{formattedTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Thought of the Day Row (Exact from Orion) */}
        {thought?.thought && (
          <div className="relative z-10 pt-4 border-t border-slate-200/70 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
                <Quote className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-indigo-600 shrink-0 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Thought of the Day:
                </span>
                <p className="text-xs sm:text-sm italic font-medium text-slate-700">
                  &ldquo;{thought.thought}&rdquo;
                  <span className="not-italic font-bold text-slate-900 ml-1.5">
                    — {thought.author}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── PRIORITY LIVE MEETING BANNER (Orion style) ────────────── */}
      {live.length > 0 && (
        <div className="relative overflow-hidden rounded-3xl p-5 md:p-6 border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-sky-500/10 to-indigo-500/10 shadow-sm transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-700 border border-cyan-500/30 shrink-0 mt-0.5 shadow-sm">
                <Zap className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide bg-rose-500/15 text-rose-700 border border-rose-500/30">
                    <Radio className="h-3 w-3 animate-pulse text-rose-600" />
                    Live Meeting In Progress
                  </span>
                  <span className="text-xs text-slate-600 font-medium">
                    ⏰ {format(parseISO(live[0].start_time), 'hh:mm a')} – {format(parseISO(live[0].end_time), 'hh:mm a')}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {live[0].event_type_title || 'Client Meeting'} with {live[0].invitees?.[0]?.name || 'Attendee'}
                </h3>
                <p className="text-xs text-slate-600">
                  Platform: <span className="font-semibold uppercase">{live[0].meeting_provider?.replace('_', ' ') || 'Video'}</span> • Meeting room is currently live and awaiting host participation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
              {live[0].meeting_join_url ? (
                <a
                  href={live[0].meeting_join_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-2xl text-xs font-extrabold bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Video className="h-4 w-4" />
                  <span>Join Meeting Room Now</span>
                </a>
              ) : (
                <Link
                  to="/meetings/upcoming"
                  className="px-4 py-2 rounded-2xl text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>View Details</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── KPI METRICS CARDS (Orion style) ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              to={s.link}
              className="glass-card rounded-2xl p-5 border border-slate-200/90 hover:border-cyan-400/80 transition-all duration-200 shadow-sm hover:shadow-md group block"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{s.label}</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">{s.value}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-500">{s.detail}</p>
                </div>
                <div
                  className={`h-11 w-11 rounded-2xl bg-gradient-to-tr ${s.gradient} text-white flex items-center justify-center shadow-md ${s.shadow} shrink-0 group-hover:scale-105 transition-transform`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── UPCOMING MEETINGS PREVIEW & QUICK ACTIONS ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Upcoming Meetings */}
        <div className="lg:col-span-2">
          <Card
            title={
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-cyan-600" />
                <span>Upcoming Appointments</span>
              </div>
            }
            subtitle="Next scheduled meetings across your personal calendar"
            action={
              <Link
                to="/meetings/upcoming"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition-all"
              >
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {loadingBookings ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading schedule...</div>
            ) : upcoming.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-700">No Upcoming Meetings</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Share your public booking page link with clients to start receiving appointments.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcoming.slice(0, 4).map((b: any) => {
                  const inv = b.invitees?.[0];
                  const start = parseISO(b.start_time);
                  const isNow = isPast(start);
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 bg-white/80 hover:bg-slate-50 transition-all ${
                        isNow ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200/80'
                      }`}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-500 text-white text-sm font-bold shadow-xs">
                        {inv?.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {inv?.name ?? 'Attendee'}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {b.event_type_title ?? 'Meeting'} • <span className="font-mono text-[11px] text-slate-400">{b.booking_reference || b.id.slice(0, 8)}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className="text-xs font-bold text-slate-800">
                          {format(start, 'dd MMM yyyy')}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(start, 'hh:mm a')}
                        </span>
                      </div>
                      <div className="shrink-0">
                        {isNow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-rose-500 rounded-full px-2.5 py-0.5 animate-pulse">
                            <Radio className="h-2.5 w-2.5" /> LIVE
                          </span>
                        ) : (
                          <StatusBadge
                            status={(b.is_rescheduled || b.rescheduled_from_id) ? 'rescheduled' : b.status}
                            label={(b.is_rescheduled || b.rescheduled_from_id) ? 'Rescheduled' : undefined}
                            dot
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Col: Quick Access Hub */}
        <div>
          <Card
            title={
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-indigo-600" />
                <span>Quick Actions</span>
              </div>
            }
            subtitle="Frequent workflows & navigation"
          >
            <div className="space-y-3">
              {quickLinks.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="group flex items-start gap-3.5 rounded-xl border border-slate-200/90 bg-white/70 hover:bg-white p-3.5 shadow-2xs hover:border-cyan-300 hover:shadow-xs transition-all"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-700 group-hover:scale-105 transition-transform">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                          {l.label}
                        </p>
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                          {l.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {l.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
