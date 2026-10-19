import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { COMMON_TIMEZONES } from '../lib/utils';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  isBefore,
  startOfToday,
  parseISO,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Phone,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Globe,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';

export const InviteeManageBookingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'details' | 'reschedule' | 'cancel'>('details');
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reschedule Date & Slot state
  const today = startOfToday();
  const [currentMonth, setCurrentMonth] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedTz, setSelectedTz] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  );
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);

  // 1. Fetch booking details via token
  const {
    data: booking,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['manage-booking', token],
    queryFn: async () => {
      const res = await api.get(`/bookings/manage/${token}`);
      return res.data;
    },
    enabled: !!token,
  });

  // 2. Fetch available slots if rescheduling
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const { data: slots = [], isLoading: loadingSlots } = useQuery({
    queryKey: [
      'slots',
      booking?.employee_username,
      booking?.event_type_slug,
      selectedDateStr,
      selectedTz,
    ],
    queryFn: async () => {
      const res = await api.get(
        `/event-types/${booking.employee_username}/${booking.event_type_slug}/slots`,
        {
          params: {
            date: selectedDateStr,
            tz: selectedTz,
          },
        }
      );
      return res.data;
    },
    enabled:
      activeTab === 'reschedule' &&
      !!booking?.employee_username &&
      !!booking?.event_type_slug,
  });

  // 3. Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/bookings/manage/${token}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manage-booking', token] });
      setActionSuccess('Your meeting has been successfully cancelled.');
      setActionError(null);
      setActiveTab('details');
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.detail || 'Failed to cancel the booking.');
    },
  });

  // 4. Reschedule Mutation
  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error('Please select a time slot.');
      const res = await api.post(`/bookings/manage/${token}/reschedule`, {
        new_start_time: selectedSlot.start_time,
        reason: rescheduleReason.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manage-booking', token] });
      setActionSuccess('Your meeting has been successfully rescheduled!');
      setActionError(null);
      setSelectedSlot(null);
      setActiveTab('details');
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.detail || 'Failed to reschedule. Selected slot may no longer be available.');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-9 w-9 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading your meeting details...</p>
        </div>
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="h-12 w-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Booking Not Found</h2>
          <p className="text-sm text-slate-500 mt-2">
            The link you followed may be invalid, or this booking reference no longer exists.
          </p>
        </div>
      </div>
    );
  }

  const startDt = parseISO(booking.start_time);
  const endDt = parseISO(booking.end_time);
  const isCancelled = booking.status === 'cancelled';

  // Calendar rendering helpers for Reschedule Tab
  const renderCalendarHeader = () => (
    <div className="flex items-center justify-between px-2 py-3 border-b border-slate-100">
      <span className="text-sm font-bold text-slate-800">
        {format(currentMonth, 'MMMM yyyy')}
      </span>
      <div className="flex items-center space-x-1">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderCalendarCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const isPast = isBefore(cloneDay, today);
        const isSelected = isSameDay(cloneDay, selectedDate);
        const isCurrentMonth = isSameMonth(cloneDay, monthStart);
        const isDisabled = isPast || !isCurrentMonth;

        days.push(
          <button
            key={day.toString()}
            disabled={isDisabled}
            onClick={() => {
              setSelectedDate(cloneDay);
              setSelectedSlot(null);
            }}
            className={`h-9 w-9 mx-auto rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
              isSelected
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/25'
                : isDisabled
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-700 hover:bg-cyan-50 hover:text-cyan-700'
            }`}
          >
            {format(day, 'd')}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7 py-1">
          {days}
        </div>
      );
      days = [];
    }
    return <div className="p-2">{rows}</div>;
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Top Brand Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-cyan-600 to-sky-600 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-tight text-lg">Kavach Connect</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Manage Booking</span>
          </div>
          <span className="text-xs font-mono bg-black/20 px-2.5 py-1 rounded-md">
            Ref: {booking.booking_reference}
          </span>
        </div>

        {/* Success / Error Alerts */}
        {actionSuccess && (
          <div className="m-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-3 text-emerald-800 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Success</p>
              <p>{actionSuccess}</p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-800 text-sm">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Notice</p>
              <p>{actionError}</p>
            </div>
          </div>
        )}

        {/* Status Banner */}
        {isCancelled ? (
          <div className="bg-red-50 border-b border-red-200 p-6 flex items-start space-x-4">
            <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-red-900">This meeting has been cancelled</h3>
              <p className="text-xs text-red-700 mt-1">
                Cancelled by: <strong className="capitalize">{booking.cancelled_by || 'Unknown'}</strong>
              </p>
              {booking.cancellation_reason && (
                <p className="text-xs text-red-600 mt-1 italic">
                  Reason: &ldquo;{booking.cancellation_reason}&rdquo;
                </p>
              )}
            </div>
          </div>
        ) : booking.is_rescheduled ? (
          <div className="bg-purple-50 border-b border-purple-200 px-6 py-3 flex items-center space-x-2 text-purple-800 text-xs font-semibold">
            <RefreshCw className="h-4 w-4 text-purple-600" />
            <span>This meeting has been rescheduled to the updated time below.</span>
          </div>
        ) : null}

        {/* Main Content Area */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Meeting Summary */}
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{booking.title || 'Meeting with Kavach'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Host: <strong className="text-slate-800">{booking.employee_name || 'Kavach Team'}</strong>
                </p>
              </div>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                  isCancelled
                    ? 'bg-red-100 text-red-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isCancelled ? 'Cancelled' : 'Confirmed'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 pt-2 border-t border-slate-200">
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4 text-cyan-600 flex-shrink-0" />
                <span>
                  <strong>Date:</strong> {format(startDt, 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-cyan-600 flex-shrink-0" />
                <span>
                  <strong>Time:</strong> {format(startDt, 'h:mm a')} - {format(endDt, 'h:mm a')} ({booking.invitee_timezone || 'UTC'})
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4 text-cyan-600 flex-shrink-0" />
                <span>
                  <strong>Invitee:</strong> {booking.invitee_name} ({booking.invitee_email})
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {booking.meeting_provider === 'phone' ? (
                  <Phone className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                ) : booking.meeting_provider === 'in_person' ? (
                  <MapPin className="h-4 w-4 text-amber-600 flex-shrink-0" />
                ) : (
                  <Video className="h-4 w-4 text-cyan-600 flex-shrink-0" />
                )}
                <span>
                  <strong>Format:</strong>{' '}
                  {booking.meeting_provider === 'phone'
                    ? 'Phone Call'
                    : booking.meeting_provider === 'in_person'
                    ? 'In-Person'
                    : 'Online Video Call'}
                </span>
              </div>
            </div>

            {!isCancelled && booking.meeting_join_url && booking.meeting_join_url.startsWith('http') && (
              <div className="pt-2">
                <a
                  href={booking.meeting_join_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 text-white rounded-lg text-xs font-bold shadow-sm hover:from-cyan-700 hover:to-sky-700 transition-all"
                >
                  <Video className="h-3.5 w-3.5 mr-1.5" />
                  Join Meeting Call
                </a>
              </div>
            )}
          </div>

          {/* Action Tabs for Active Bookings */}
          {!isCancelled && activeTab === 'details' && (
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => {
                  setActionError(null);
                  setActionSuccess(null);
                  setActiveTab('reschedule');
                }}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reschedule Meeting</span>
              </button>
              <button
                onClick={() => {
                  setActionError(null);
                  setActionSuccess(null);
                  setActiveTab('cancel');
                }}
                className="py-3 px-5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2"
              >
                <XCircle className="h-4 w-4" />
                <span>Cancel</span>
              </button>
            </div>
          )}

          {/* Cancel Confirmation View */}
          {!isCancelled && activeTab === 'cancel' && (
            <div className="border border-red-200 bg-red-50/50 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-red-900 flex items-center space-x-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span>Confirm Cancellation</span>
                </h3>
                <button
                  onClick={() => setActiveTab('details')}
                  className="p-1 hover:bg-red-100 rounded text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Are you sure you want to cancel this meeting? Both you and the host will receive a cancellation email notification.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Cancellation (optional):
                </label>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Schedule conflict, need to reschedule later..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <button
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Meeting'}
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className="py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  Keep Meeting
                </button>
              </div>
            </div>
          )}

          {/* Reschedule View */}
          {!isCancelled && activeTab === 'reschedule' && (
            <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-white">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <RefreshCw className="h-4 w-4 text-cyan-600" />
                  <span>Select a New Date & Time</span>
                </h3>
                <button
                  onClick={() => setActiveTab('details')}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Timezone picker */}
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4 text-slate-400" />
                <select
                  value={selectedTz}
                  onChange={(e) => setSelectedTz(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Calendar & Slot Picker Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Mini Calendar */}
                <div className="border border-slate-200 rounded-xl p-2 bg-white">
                  {renderCalendarHeader()}
                  <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-slate-400 py-1.5">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i}>{d}</div>
                    ))}
                  </div>
                  {renderCalendarCells()}
                </div>

                {/* Slots Column */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col">
                  <span className="text-xs font-bold text-slate-800 mb-2">
                    Available Times for {format(selectedDate, 'MMM d, yyyy')}
                  </span>
                  <div className="flex-1 overflow-y-auto max-h-56 space-y-1.5 pr-1">
                    {loadingSlots ? (
                      <div className="h-32 flex items-center justify-center">
                        <div className="h-5 w-5 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="h-32 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <Clock className="h-6 w-6 mb-1 text-slate-300" />
                        <span>No available slots on this day.</span>
                      </div>
                    ) : (
                      slots.map((s: any) => {
                        const isChosen = selectedSlot?.start_time === s.start_time;
                        return (
                          <button
                            key={s.start_time}
                            onClick={() => setSelectedSlot(s)}
                            className={`w-full py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
                              isChosen
                                ? 'bg-cyan-600 text-white shadow-sm'
                                : 'bg-white border border-slate-200 text-slate-700 hover:border-cyan-500 hover:text-cyan-700'
                            }`}
                          >
                            {s.formatted_time}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Reschedule Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Rescheduling (optional):
                </label>
                <input
                  type="text"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="e.g. Prior commitment came up..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  disabled={!selectedSlot || rescheduleMutation.isPending}
                  onClick={() => rescheduleMutation.mutate()}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center space-x-2"
                >
                  {rescheduleMutation.isPending ? (
                    'Rescheduling...'
                  ) : (
                    <>
                      <span>Confirm Reschedule</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className="py-3 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
