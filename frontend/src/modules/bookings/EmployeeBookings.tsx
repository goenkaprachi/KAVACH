import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import {
  format,
  parseISO,
  isToday,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  isBefore,
  isAfter,
  isPast,
  isFuture,
} from 'date-fns';
import {
  Calendar,
  Clock,
  Video,
  XCircle,
  ExternalLink,
  AlertCircle,
  X,
  CalendarClock,
  Phone,
  Copy,
  Check,
  Trash2,
  Mail,
  Building,
  SlidersHorizontal,
  ChevronDown,
  Radio,
  CheckCircle2,
  Search,
  RefreshCw,
  History,
  Plus,
  FileText,
  BellRing,
  UserCheck,
} from 'lucide-react';
import { MeetingDetailsModal } from './MeetingDetailsModal';
import { getAttendeePhone } from '../../lib/utils';
import { EditAttendeeModal } from './EditAttendeeModal';
import { AdminDeleteBookingModal } from './AdminDeleteBookingModal';
import { ScheduleInternalMeetingModal } from './ScheduleInternalMeetingModal';
import { MeetingOutcomeModal } from './MeetingOutcomeModal';
import { StatusBadge } from '../../components/StatusBadge';
import { Card } from '../../components/Card';

type DateRange = 'today' | 'week' | 'month' | 'custom' | 'all';
type StatusFilter = 'all' | 'confirmed' | 'rescheduled' | 'cancelled';

export interface EmployeeBookingsProps {
  activeTab?: 'upcoming' | 'past';
}

export const EmployeeBookings: React.FC<EmployeeBookingsProps> = ({ activeTab = 'upcoming' }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  // Filter & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Modal state
  const [cancellingBooking, setCancellingBooking] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scheduleInternalOpen, setScheduleInternalOpen] = useState(false);
  const [outcomeBooking, setOutcomeBooking] = useState<any | null>(null);
  const [editingAttendeeBooking, setEditingAttendeeBooking] = useState<any | null>(null);

  // Reschedule state
  const [reschedulingBooking, setReschedulingBooking] = useState<any | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Fetch all meetings
  const { data: allBookings = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['bookings-all'],
    queryFn: async () => {
      const res = await api.get('/bookings', { params: { limit: 200 } });
      return res.data;
    },
  });

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setTimeout(() => {
        setIsManualRefreshing(false);
      }, 700);
    }
  };

  const { data: availableSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: [
      'reschedule-slots',
      reschedulingBooking?.employee_username,
      reschedulingBooking?.event_type_slug,
      rescheduleDate,
    ],
    queryFn: async () => {
      if (!reschedulingBooking?.employee_username || !reschedulingBooking?.event_type_slug || !rescheduleDate)
        return [];
      const res = await api.get(
        `/event-types/${reschedulingBooking.employee_username}/${reschedulingBooking.event_type_slug}/slots`,
        { params: { date: rescheduleDate, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } }
      );
      return res.data;
    },
    enabled: !!reschedulingBooking && !useCustomTime,
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      await api.patch(`/bookings/${id}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings-all'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-dashboard'] });
      setCancellingBooking(null);
      setCancelReason('');
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, newStartTime, reason }: { id: string; newStartTime: string; reason: string }) =>
      await api.post(`/bookings/${id}/reschedule`, { new_start_time: newStartTime, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings-all'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-dashboard'] });
      setReschedulingBooking(null);
      setRescheduleReason('');
      setSelectedSlot(null);
      setCustomTime('');
      setRescheduleError(null);
    },
    onError: (err: any) => {
      setRescheduleError(err.response?.data?.detail || 'Failed to reschedule. Please try again.');
    },
  });

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenReschedule = (booking: any) => {
    setReschedulingBooking(booking);
    setRescheduleReason('');
    setRescheduleDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedSlot(null);
    setCustomTime('');
    setUseCustomTime(false);
    setRescheduleError(null);
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleReason.trim()) {
      setRescheduleError('Please provide a reason for rescheduling.');
      return;
    }
    let newStartUtc: string;
    if (useCustomTime) {
      if (!customTime) {
        setRescheduleError('Please select a new date & time.');
        return;
      }
      newStartUtc = new Date(customTime).toISOString();
    } else {
      if (!selectedSlot) {
        setRescheduleError('Please select an available time slot.');
        return;
      }
      newStartUtc = selectedSlot.start_time;
    }
    rescheduleMutation.mutate({
      id: reschedulingBooking.id,
      newStartTime: newStartUtc,
      reason: rescheduleReason.trim(),
    });
  };

  // Filter legacy duplicates
  const cleanBookings = useMemo(() => {
    return allBookings.filter(
      (b: any) => !(b.status === 'cancelled' && b.cancellation_reason?.startsWith('Rescheduled'))
    );
  }, [allBookings]);

  // Apply filters & search
  const filteredBookings = useMemo(() => {
    return cleanBookings.filter((b: any) => {
      const start = parseISO(b.start_time);
      const now = new Date();

      // Search term filter (attendee name, email, phone, company, ref)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const inv = b.invitees?.[0];
        const phone = getAttendeePhone(inv) || '';
        const company = inv?.custom_answers?.['Company name'] || inv?.custom_answers?.['company name'] || '';
        const ref = b.booking_reference || b.id || '';
        const name = inv?.name || '';
        const email = inv?.email || '';
        const eventTitle = b.event_type_title || '';

        const matches =
          name.toLowerCase().includes(term) ||
          email.toLowerCase().includes(term) ||
          phone.toLowerCase().includes(term) ||
          company.toLowerCase().includes(term) ||
          ref.toLowerCase().includes(term) ||
          eventTitle.toLowerCase().includes(term);

        if (!matches) return false;
      }

      // Status filter
      if (statusFilter === 'confirmed') {
        if (b.status !== 'confirmed' || b.is_rescheduled || b.rescheduled_from_id) return false;
      } else if (statusFilter === 'rescheduled') {
        if (!(b.is_rescheduled || b.rescheduled_from_id)) return false;
      } else if (statusFilter === 'cancelled') {
        if (b.status !== 'cancelled') return false;
      }

      // Date range filter
      if (dateRange === 'today') {
        if (!isToday(start)) return false;
      } else if (dateRange === 'week') {
        const wStart = startOfWeek(now, { weekStartsOn: 1 });
        const wEnd = endOfWeek(now, { weekStartsOn: 1 });
        if (!isWithinInterval(start, { start: wStart, end: wEnd })) return false;
      } else if (dateRange === 'month') {
        const mStart = startOfMonth(now);
        const mEnd = endOfMonth(now);
        if (!isWithinInterval(start, { start: mStart, end: mEnd })) return false;
      } else if (dateRange === 'custom') {
        if (customFrom && isBefore(start, new Date(customFrom))) return false;
        if (customTo) {
          const toEnd = new Date(customTo);
          toEnd.setHours(23, 59, 59, 999);
          if (isAfter(start, toEnd)) return false;
        }
      }

      return true;
    });
  }, [cleanBookings, searchTerm, statusFilter, dateRange, customFrom, customTo]);

  const now = new Date();
  const liveAndUpcoming = useMemo(() => {
    return filteredBookings
      .filter((b: any) => b.status === 'confirmed' && !isPast(parseISO(b.end_time)))
      .sort((a: any, b: any) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime());
  }, [filteredBookings]);

  const completed = useMemo(() => {
    return filteredBookings
      .filter((b: any) => b.status !== 'confirmed' || isPast(parseISO(b.end_time)))
      .sort((a: any, b: any) => parseISO(b.start_time).getTime() - parseISO(a.start_time).getTime());
  }, [filteredBookings]);

  const isLive = (b: any) => {
    const start = parseISO(b.start_time);
    const end = parseISO(b.end_time);
    return isBefore(start, now) && isAfter(end, now);
  };

  const liveCount = useMemo(() => {
    return cleanBookings.filter((b: any) => {
      if (b.status !== 'confirmed') return false;
      const start = parseISO(b.start_time);
      const end = parseISO(b.end_time);
      return isBefore(start, now) && isAfter(end, now);
    }).length;
  }, [cleanBookings, now]);

  const activeRows = activeTab === 'upcoming' ? liveAndUpcoming : completed;

  const activeFilterCount = [
    searchTerm ? 1 : 0,
    dateRange !== 'all' ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // ── Shared Row Renderer ───────────────────────────────────────
  const renderRow = (booking: any, idx: number, showLiveBadge = false) => {
    const startDt = parseISO(booking.start_time);
    const endDt = parseISO(booking.end_time);
    const invitee = booking.invitees?.[0];
    const refId = booking.booking_reference || booking.id.slice(0, 8);
    const isCopied = copiedId === refId;
    const isConfirmed = booking.status === 'confirmed';
    const live = showLiveBadge && isLive(booking);
    const isPastMeeting = activeTab === 'past' || isPast(endDt);

    return (
      <tr
        key={booking.id}
        onClick={() => setDetailsBooking(booking)}
        className={`hover:bg-slate-50/75 transition-colors cursor-pointer ${
          live ? 'bg-cyan-50/25' : idx % 2 !== 0 ? 'bg-slate-50/20' : ''
        }`}
      >
        {/* COL 1: Attendee (Clean & Minimalist: Avatar + Name + Email) */}
        <td className="px-6 py-4 align-middle">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500/15 to-sky-500/15 border border-cyan-500/20 text-cyan-700 flex items-center justify-center font-bold text-xs shrink-0">
              {invitee?.name ? invitee.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm truncate hover:text-cyan-700 transition-colors">
                  {invitee?.name || <span className="text-slate-400 italic font-normal">No name</span>}
                </span>
                {live && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-black animate-pulse">
                    <Radio className="h-2.5 w-2.5" /> LIVE
                  </span>
                )}
              </div>
              {invitee?.email && (
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {invitee.email}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* COL 2: Date & Time (Clean Stack) */}
        <td className="px-6 py-4 align-middle whitespace-nowrap">
          <div className="text-xs font-semibold text-slate-800">
            {format(startDt, 'EEE, dd MMM yyyy')}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {format(startDt, 'hh:mm a')} – {format(endDt, 'hh:mm a')}
          </div>
        </td>

        {/* COL 3: Event Type & Ref ID */}
        <td className="px-6 py-4 align-middle whitespace-nowrap">
          <div className="text-xs font-semibold text-slate-800 truncate">
            {Boolean(booking.event_type_id) ? 'Meeting with Kavach' : (booking.title || booking.event_type_title || 'Meeting')}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-[11px] text-slate-400">
              {refId}
            </span>
            <button
              type="button"
              onClick={(e) => handleCopyId(e, refId)}
              className="text-slate-400 hover:text-cyan-600 transition-colors"
              title="Copy Booking Reference"
            >
              {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </td>

        {/* COL 4: Status */}
        <td className="px-6 py-4 align-middle whitespace-nowrap">
          <StatusBadge
            status={
              live
                ? 'in_progress'
                : (booking.is_rescheduled || booking.rescheduled_from_id)
                ? 'rescheduled'
                : isPastMeeting
                ? (booking.status === 'confirmed' ? 'completed' : 'cancelled')
                : booking.status
            }
            label={
              live
                ? 'In Progress'
                : (booking.is_rescheduled || booking.rescheduled_from_id)
                ? 'Rescheduled'
                : isPastMeeting && booking.status === 'confirmed'
                ? 'Completed'
                : undefined
            }
            dot
          />
          {booking.cancellation_reason && !booking.cancellation_reason.startsWith('Rescheduled') && (
            <div className="text-[10px] text-rose-500 mt-1 max-w-[150px] truncate" title={booking.cancellation_reason}>
              {booking.cancellation_reason}
            </div>
          )}
          {booking.followup_required && (
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  booking.followup_status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : booking.followup_date && isPast(parseISO(booking.followup_date))
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                <BellRing className="h-2.5 w-2.5" />
                <span>
                  {booking.followup_status === 'completed'
                    ? 'Follow-up Done'
                    : booking.followup_date && isPast(parseISO(booking.followup_date))
                    ? 'Follow-up Overdue'
                    : 'Follow-up Due'}
                </span>
              </span>
            </div>
          )}
          {booking.meeting_outcome && (
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 capitalize truncate max-w-[140px]">
              Outcome: {booking.meeting_outcome.replace(/_/g, ' ')}
            </div>
          )}
        </td>

        {/* COL 5: Actions */}
        <td className="px-6 py-4 align-middle text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {activeTab === 'upcoming' ? (
              <>
                {isConfirmed && booking.meeting_join_url && (
                  <a
                    href={booking.meeting_join_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                      live
                        ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                        : 'bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white shadow-cyan-500/20'
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span>{live ? 'Join Live' : 'Join'}</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setOutcomeBooking(booking)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Record Meeting Notes & Outcome"
                >
                  <FileText className="h-3.5 w-3.5 text-cyan-600" />
                  <span>Outcome</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailsBooking(booking)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                >
                  Details
                </button>

                <button
                  type="button"
                  onClick={() => setEditingAttendeeBooking(booking)}
                  title="Edit Attendee Details"
                  className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                </button>

                {isConfirmed && (
                  <button
                    type="button"
                    onClick={() => handleOpenReschedule(booking)}
                    title="Reschedule"
                    className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <CalendarClock className="h-4 w-4" />
                  </button>
                )}

                {isConfirmed && (
                  <button
                    type="button"
                    onClick={() => setCancellingBooking(booking)}
                    title="Cancel"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}

                {(isAdmin || booking.employee_id === user?.id) && (
                  <button
                    type="button"
                    onClick={() => setDeletingBooking(booking)}
                    title="Delete Permanently"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : (
              /* Past & Completed view - minimal & clean actions */
              <>
                <button
                  type="button"
                  onClick={() => setOutcomeBooking(booking)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Record Meeting Notes & Outcome"
                >
                  <FileText className="h-3.5 w-3.5 text-cyan-600" />
                  <span>Outcome & Notes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailsBooking(booking)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                >
                  View Details
                </button>

                <button
                  type="button"
                  onClick={() => setEditingAttendeeBooking(booking)}
                  title="Edit Attendee Details"
                  className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                </button>

                {(isAdmin || booking.employee_id === user?.id) && (
                  <button
                    type="button"
                    onClick={() => setDeletingBooking(booking)}
                    title="Delete Permanently"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Orion Segmented Navigation Tabs ─────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/90 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xs">
          <button
            type="button"
            onClick={() => navigate('/meetings/upcoming')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 ${
              activeTab === 'upcoming'
                ? 'bg-white text-slate-900 shadow-md shadow-slate-200/60 border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <div className="relative flex items-center">
              <Radio className={`h-4 w-4 ${activeTab === 'upcoming' ? 'text-cyan-600' : 'text-slate-400'}`} />
              {liveCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
              )}
            </div>
            <span>Live & Upcoming</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'upcoming'
                  ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {liveAndUpcoming.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/meetings/past')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 ${
              activeTab === 'past'
                ? 'bg-white text-slate-900 shadow-md shadow-slate-200/60 border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <History className={`h-4 w-4 ${activeTab === 'past' ? 'text-cyan-600' : 'text-slate-400'}`} />
            <span>Past & Completed</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'past'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {completed.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isManualRefreshing || isFetching}
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs hover:border-slate-300 transition-all disabled:opacity-75 cursor-pointer"
            title="Refresh Meetings"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-cyan-600 ${
                isManualRefreshing || isFetching ? 'animate-spin' : ''
              }`}
            />
            <span>{isManualRefreshing || isFetching ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Orion Page Header ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            {activeTab === 'upcoming' ? <Calendar className="h-5 w-5" /> : <History className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {activeTab === 'upcoming' ? 'Live & Upcoming Meetings' : 'Past & Completed Meetings'}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                activeTab === 'upcoming'
                  ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {activeRows.length} {activeTab === 'upcoming' ? 'Upcoming' : 'Past Records'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === 'upcoming'
                ? 'Real-time active calls, incoming client appointments & instant join links'
                : 'Historical appointment records, cancellation logs, attendee dossiers & audit trail'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setScheduleInternalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Internal Meeting</span>
          </button>
        </div>
      </div>

      {/* ── Orion Filter & Search Toolbar ────────────────────────── */}
      <Card className="p-4 bg-white/90 backdrop-blur-xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by attendee, email, phone, company, or ID..."
              className="w-full pl-10 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 text-slate-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start sm:justify-end">
            {/* Date Range Pills */}
            <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
              {([
                { value: 'all', label: 'All Time' },
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' },
                { value: 'custom', label: 'Custom' },
              ] as { value: DateRange; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDateRange(value)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    dateRange === value
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Status Select */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed Only</option>
              <option value="rescheduled">Rescheduled Only</option>
              <option value="cancelled">Cancelled Only</option>
            </select>

            {/* Reset */}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setDateRange('all');
                  setStatusFilter('all');
                  setCustomFrom('');
                  setCustomTo('');
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2 py-1 transition-colors"
              >
                × Reset
              </button>
            )}
          </div>
        </div>

        {/* Custom date range picker if custom selected */}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Custom Range:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50"
            />
          </div>
        )}
      </Card>

      {/* ── Table Content ────────────────────────────────────────── */}
      {isLoading ? (
        <Card className="p-12 text-center text-sm font-medium text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-cyan-600" />
          Loading Appointments...
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden bg-white border border-slate-200/90 shadow-xl shadow-slate-200/40">
          {/* Section Header Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-cyan-500/10 text-cyan-700 flex items-center justify-center font-bold">
                {activeTab === 'upcoming' ? <Radio className="h-4 w-4 text-cyan-600" /> : <History className="h-4 w-4 text-slate-600" />}
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  {activeTab === 'upcoming' ? 'Scheduled & Live Appointments' : 'Historical & Completed Appointments'}
                </span>
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-100 text-slate-600">
                  {activeRows.length}
                </span>
              </div>
            </div>
          </div>

          {activeRows.length === 0 ? (
            <div className="px-6 py-16 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                {activeTab === 'upcoming' ? <Calendar className="h-6 w-6" /> : <History className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {activeTab === 'upcoming' ? 'No Upcoming Meetings' : 'No Past Meetings'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {activeTab === 'upcoming'
                    ? 'No scheduled meetings found matching your current filter criteria.'
                    : 'No past or cancelled meeting records found for the selected time range.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3.5">Attendee</th>
                    <th className="px-6 py-3.5">Date & Time</th>
                    <th className="px-6 py-3.5">Event Type</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {activeRows.map((b: any, i: number) => renderRow(b, i, activeTab === 'upcoming'))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Modals ──────────────────────────────────────────────── */}
      <MeetingDetailsModal
        booking={detailsBooking}
        isOpen={!!detailsBooking}
        onClose={() => setDetailsBooking(null)}
        onOpenReschedule={handleOpenReschedule}
        onOpenCancel={(b) => setCancellingBooking(b)}
        onOpenDelete={(b) => setDeletingBooking(b)}
        isAdmin={isAdmin || (detailsBooking && detailsBooking.employee_id === user?.id)}
      />

      <AdminDeleteBookingModal
        booking={deletingBooking}
        isOpen={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
        onSuccess={() => {
          refetch();
          setDetailsBooking(null);
        }}
      />

      {/* Cancel Modal */}
      {cancellingBooking && (
        <div className="modal-overlay" onClick={() => setCancellingBooking(null)}>
          <div className="modal-sheet max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Cancel Meeting</h3>
              <button
                onClick={() => setCancellingBooking(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!cancellingBooking) return;
                cancelMutation.mutate({ id: cancellingBooking.id, reason: cancelReason });
              }}
              className="mt-4 space-y-4"
            >
              <p className="text-xs text-slate-600 leading-relaxed">
                Cancel the meeting with{' '}
                <strong>{cancellingBooking.invitees?.[0]?.name || 'Invitee'}</strong>? Both parties will be notified.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 leading-relaxed"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCancellingBooking(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Keep Meeting
                </button>
                <button
                  type="submit"
                  disabled={cancelMutation.isPending || !cancelReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingBooking && (
        <div className="modal-overlay" onClick={() => setReschedulingBooking(null)}>
          <div className="modal-sheet max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Reschedule Meeting</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose a new time and provide a reason.</p>
              </div>
              <button
                onClick={() => setReschedulingBooking(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRescheduleSubmit} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-0.5">
                <div className="font-semibold text-slate-800">
                  {(Boolean(reschedulingBooking.event_type_id) ? 'Meeting with Kavach' : (reschedulingBooking.title || reschedulingBooking.event_type_title || 'Meeting'))} with{' '}
                  {reschedulingBooking.invitees?.[0]?.name || 'Invitee'}
                </div>
                <div className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Current: {format(parseISO(reschedulingBooking.start_time), 'EEEE, MMMM dd, yyyy @ hh:mm a')}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Why is this being rescheduled?"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 leading-relaxed"
                />
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">New Date & Time</label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomTime(!useCustomTime);
                      setSelectedSlot(null);
                      setCustomTime('');
                    }}
                    className="text-[11px] font-bold text-cyan-600 hover:text-cyan-700"
                  >
                    {useCustomTime ? '← Available slots' : 'Custom datetime →'}
                  </button>
                </div>
                {useCustomTime ? (
                  <input
                    type="datetime-local"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                  />
                ) : (
                  <div className="space-y-2">
                    <input
                      type="date"
                      min={format(new Date(), 'yyyy-MM-dd')}
                      value={rescheduleDate}
                      onChange={(e) => {
                        setRescheduleDate(e.target.value);
                        setSelectedSlot(null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                    />
                    {loadingSlots ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <div key={n} className="h-8 bg-slate-100 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                        No slots on this date.
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto">
                        {availableSlots.map((slot: any) => (
                          <button
                            key={slot.start_time}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-1.5 px-1 rounded-xl text-[11px] font-bold border transition-all text-center ${
                              selectedSlot?.start_time === slot.start_time
                                ? 'bg-cyan-600 border-cyan-600 text-white shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-cyan-400 hover:bg-cyan-50'
                            }`}
                          >
                            {slot.formatted_time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {(selectedSlot || customTime) && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    New Slot Selected:{' '}
                    <strong>
                      {useCustomTime
                        ? format(new Date(customTime), 'EEE, dd MMM yyyy @ hh:mm a')
                        : `${rescheduleDate} @ ${selectedSlot.formatted_time}`}
                    </strong>
                  </span>
                </div>
              )}
              {rescheduleError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-medium flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{rescheduleError}</span>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReschedulingBooking(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleMutation.isPending || (!selectedSlot && !customTime)}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
                >
                  {rescheduleMutation.isPending ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Internal Meeting Modal */}
      <ScheduleInternalMeetingModal
        isOpen={scheduleInternalOpen}
        onClose={() => setScheduleInternalOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Meeting Outcome & Notes Modal */}
      <MeetingOutcomeModal
        booking={outcomeBooking}
        isOpen={Boolean(outcomeBooking)}
        onClose={() => setOutcomeBooking(null)}
        onSuccess={() => refetch()}
      />

      {/* Edit Attendee Modal */}
      <EditAttendeeModal
        booking={editingAttendeeBooking}
        isOpen={Boolean(editingAttendeeBooking)}
        onClose={() => setEditingAttendeeBooking(null)}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
