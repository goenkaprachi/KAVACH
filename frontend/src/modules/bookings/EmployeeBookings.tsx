import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { format, parseISO } from 'date-fns';
import { 
  Calendar, 
  Clock, 
  Video, 
  User, 
  Mail, 
  XCircle, 
  ExternalLink, 
  AlertCircle,
  X,
  CalendarClock,
  Building,
  Phone,
  Copy,
  Check,
  History,
  Trash2,
  Info
} from 'lucide-react';
import { MeetingDetailsModal, getAttendeePhone } from './MeetingDetailsModal';
import { AdminDeleteBookingModal } from './AdminDeleteBookingModal';

export const EmployeeBookings: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancellingBooking, setCancellingBooking] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Details & Logs Modal State
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);

  // Admin Delete Modal State
  const [deletingBooking, setDeletingBooking] = useState<any | null>(null);

  // Quick ID Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Reschedule State
  const [reschedulingBooking, setReschedulingBooking] = useState<any | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', tab],
    queryFn: async () => {
      const res = await api.get('/bookings', {
        params: { upcoming: tab === 'upcoming' }
      });
      return res.data;
    },
  });

  const { data: availableSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: [
      'reschedule-slots',
      reschedulingBooking?.employee_username,
      reschedulingBooking?.event_type_slug,
      rescheduleDate,
    ],
    queryFn: async () => {
      if (!reschedulingBooking?.employee_username || !reschedulingBooking?.event_type_slug || !rescheduleDate) {
        return [];
      }
      const res = await api.get(
        `/event-types/${reschedulingBooking.employee_username}/${reschedulingBooking.event_type_slug}/slots`,
        {
          params: {
            date: rescheduleDate,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          },
        }
      );
      return res.data;
    },
    enabled: !!reschedulingBooking && !useCustomTime,
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await api.patch(`/bookings/${id}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setCancellingBooking(null);
      setCancelReason('');
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, new_start_time, reason }: { id: string; new_start_time: string; reason: string }) => {
      const res = await api.patch(`/bookings/${id}/reschedule`, {
        new_start_time,
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setReschedulingBooking(null);
      setRescheduleReason('');
      setSelectedSlot(null);
      setCustomTime('');
      setRescheduleError(null);
    },
    onError: (err: any) => {
      setRescheduleError(err.response?.data?.detail || 'Failed to reschedule meeting. Please pick another slot.');
    },
  });

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingBooking) return;
    cancelMutation.mutate({
      id: cancellingBooking.id,
      reason: cancelReason,
    });
  };

  const handleOpenReschedule = (booking: any) => {
    setReschedulingBooking(booking);
    setRescheduleReason('');
    setSelectedSlot(null);
    setCustomTime('');
    setUseCustomTime(false);
    setRescheduleError(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleDate(format(tomorrow, 'yyyy-MM-dd'));
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingBooking) return;
    if (!rescheduleReason.trim()) {
      setRescheduleError('Please provide a reason for rescheduling.');
      return;
    }

    let newStartTime: string;
    if (useCustomTime) {
      if (!customTime) {
        setRescheduleError('Please select a custom date and time.');
        return;
      }
      newStartTime = new Date(customTime).toISOString();
    } else {
      if (!selectedSlot) {
        setRescheduleError('Please select an available time slot.');
        return;
      }
      newStartTime = selectedSlot.start_time;
    }

    rescheduleMutation.mutate({
      id: reschedulingBooking.id,
      new_start_time: newStartTime,
      reason: rescheduleReason.trim(),
    });
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter out legacy duplicate cancelled records from before single-record update was deployed
  const displayBookings = bookings.filter((b: any) => {
    return !(b.status === 'cancelled' && b.cancellation_reason?.startsWith('Rescheduled'));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Your Meetings</h1>
          <p className="text-sm text-slate-500">
            View upcoming schedule, attendee details, and complete meeting change history
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('upcoming')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === 'upcoming'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upcoming Meetings
          </button>
          <button
            onClick={() => setTab('past')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === 'past'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Past Meetings
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : displayBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <Calendar className="h-12 w-12 text-slate-400 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            No {tab} meetings found
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {tab === 'upcoming'
              ? 'When clients schedule consultations via your public booking link, they will appear here.'
              : 'Past consultations and meeting logs will be archived here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayBookings.map((booking: any) => {
            const startDt = parseISO(booking.start_time);
            const endDt = parseISO(booking.end_time);
            const invitee = booking.invitees?.[0];
            const phone = getAttendeePhone(invitee);
            const refId = booking.booking_reference || booking.id.slice(0, 8);
            const isCopied = copiedId === refId;

            return (
              <div
                key={booking.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                {/* Meeting & Attendee Information */}
                <div className="space-y-3 flex-1 min-w-0">
                  {/* Top Bar: Event Type Title, Unique Meeting ID, Status */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDetailsBooking(booking)}
                      className="font-bold text-slate-900 text-base hover:text-blue-600 text-left transition-colors truncate"
                      title="Click to view full details & change logs"
                    >
                      {booking.event_type_title || 'Meeting'}
                    </button>

                    {/* Unique Meeting ID Chip with Copy */}
                    <div className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-md text-[11px] font-mono text-slate-700 transition-colors border border-slate-200/60">
                      <span className="text-slate-400 font-sans font-medium">ID:</span>
                      <span className="font-semibold text-slate-800">{refId}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyId(e, refId)}
                        className="text-slate-400 hover:text-blue-600 transition-colors ml-0.5"
                        title="Copy Meeting ID"
                      >
                        {isCopied ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border ${
                        booking.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>

                  {/* Date, Time, and Host Details */}
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-600">
                    <div className="flex items-center space-x-1.5 font-semibold text-slate-800 bg-blue-50/70 border border-blue-100/80 px-2.5 py-1 rounded-lg">
                      <Calendar className="h-3.5 w-3.5 text-blue-600" />
                      <span>{format(startDt, 'EEE, dd MMM yyyy')}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 font-medium text-slate-700">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        {format(startDt, 'hh:mm a')} – {format(endDt, 'hh:mm a')}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 text-slate-500">
                      <Video className="h-3.5 w-3.5 text-slate-400" />
                      <span className="capitalize">{booking.meeting_provider?.replace('_', ' ') || 'Online'}</span>
                    </div>
                  </div>

                  {/* Attendee Details: Name, Email, Contact Phone, Company */}
                  {invitee && (
                    <div className="pt-1 border-t border-slate-100/80 flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs">
                      <div className="flex items-center space-x-1.5 font-semibold text-slate-900">
                        <User className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                        <span>{invitee.name}</span>
                      </div>

                      <a
                        href={`mailto:${invitee.email}`}
                        className="flex items-center space-x-1 text-slate-600 hover:text-blue-600 transition-colors"
                      >
                        <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <span>{invitee.email}</span>
                      </a>

                      {/* Attendee Contact Phone Number */}
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="inline-flex items-center space-x-1 font-semibold text-emerald-700 bg-emerald-50/80 border border-emerald-200/80 px-2 py-0.5 rounded text-[11px] hover:bg-emerald-100 transition-colors"
                          title="Click to call attendee"
                        >
                          <Phone className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                          <span>{phone}</span>
                        </a>
                      )}

                      {invitee.custom_answers?.['Company name'] && (
                        <div className="inline-flex items-center space-x-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          <Building className="h-3 w-3 text-slate-400 flex-shrink-0" />
                          <span>{invitee.custom_answers['Company name']}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cancellation Reason note if cancelled */}
                  {booking.cancellation_reason && (
                    <div className="text-xs p-2.5 rounded-xl flex items-start space-x-2 bg-red-50/80 border border-red-200 text-red-700 mt-1">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" />
                      <div>
                        <span className="font-bold">Cancellation Reason:</span>{' '}
                        {booking.cancellation_reason.replace(/^Rescheduled:\s*/, '')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  {/* Details & Logs Modal Trigger */}
                  <button
                    type="button"
                    onClick={() => setDetailsBooking(booking)}
                    className="inline-flex items-center space-x-1.5 text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors"
                    title="View details & change audit trail"
                  >
                    <History className="h-3.5 w-3.5 text-slate-500" />
                    <span>Details & Logs</span>
                  </button>

                  {/* Join Meeting Room */}
                  {booking.status === 'confirmed' && booking.meeting_join_url && (
                    <a
                      href={booking.meeting_join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-colors"
                    >
                      <Video className="h-3.5 w-3.5" />
                      <span>Join</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {/* Reschedule Button */}
                  {booking.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => handleOpenReschedule(booking)}
                      className="inline-flex items-center space-x-1.5 text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                      title="Reschedule Meeting with Reason"
                    >
                      <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                      <span>Reschedule</span>
                    </button>
                  )}

                  {/* Cancel Button */}
                  {booking.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => setCancellingBooking(booking)}
                      className="inline-flex items-center space-x-1 text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}

                  {/* Admin Hard Delete Button */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDeletingBooking(booking)}
                      className="inline-flex items-center space-x-1 text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border border-red-200 hover:border-red-600"
                      title="Permanently delete this meeting from database (Admin)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Meeting Details & Change Logs Popup Modal */}
      <MeetingDetailsModal
        booking={detailsBooking}
        isOpen={!!detailsBooking}
        onClose={() => setDetailsBooking(null)}
        onOpenReschedule={handleOpenReschedule}
        onOpenCancel={(b) => setCancellingBooking(b)}
        onOpenDelete={(b) => setDeletingBooking(b)}
        isAdmin={isAdmin}
      />

      {/* Admin Delete Confirmation Modal */}
      <AdminDeleteBookingModal
        booking={deletingBooking}
        isOpen={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
      />

      {/* Cancel Modal */}
      {cancellingBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Cancel Meeting</h3>
              <button
                onClick={() => setCancellingBooking(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCancelSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to cancel the meeting with{' '}
                <strong>{cancellingBooking.invitees?.[0]?.name || 'Invitee'}</strong>? Both parties will receive cancellation notices and the change will be saved to the audit log.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Client requested cancellation or scheduling conflict..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingBooking(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Keep Meeting
                </button>
                <button
                  type="submit"
                  disabled={cancelMutation.isPending || !cancelReason.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Reschedule Meeting</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick a new time slot and specify the reason for rescheduling.
                </p>
              </div>
              <button
                onClick={() => setReschedulingBooking(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="mt-4 space-y-4">
              {/* Current Meeting Info Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-slate-800">
                  {reschedulingBooking.event_type_title || 'Meeting'} with {reschedulingBooking.invitees?.[0]?.name || 'Invitee'}
                </div>
                <div className="text-slate-500 flex items-center space-x-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    Current Time: {format(parseISO(reschedulingBooking.start_time), 'EEEE, MMMM dd, yyyy @ hh:mm a')}
                  </span>
                </div>
              </div>

              {/* Reason for Rescheduling (Mandatory) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Rescheduling <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this meeting is being rescheduled (e.g. Schedule conflict, client requested morning slot, emergency)..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  This explanation will be shared with the attendee and recorded in the audit history.
                </p>
              </div>

              {/* Date & Slot Picker */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Select New Date & Time
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomTime(!useCustomTime);
                      setSelectedSlot(null);
                      setCustomTime('');
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {useCustomTime ? 'Select from available slots' : 'Enter custom datetime'}
                  </button>
                </div>

                {useCustomTime ? (
                  <div>
                    <input
                      type="datetime-local"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <input
                        type="date"
                        min={format(new Date(), 'yyyy-MM-dd')}
                        value={rescheduleDate}
                        onChange={(e) => {
                          setRescheduleDate(e.target.value);
                          setSelectedSlot(null);
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    {/* Slots Grid */}
                    <div>
                      <span className="block text-[11px] font-medium text-slate-500 mb-2">
                        Available Slots for {format(parseISO(rescheduleDate + 'T00:00:00'), 'EEEE, MMM dd')}:
                      </span>

                      {loadingSlots ? (
                        <div className="grid grid-cols-3 gap-2 py-2">
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <div key={n} className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                          ))}
                        </div>
                      ) : availableSlots.length === 0 ? (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                          No open slots available on this date. Please pick another date or use custom datetime.
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1">
                          {availableSlots.map((slot: any) => {
                            const isSelected = selectedSlot?.start_time === slot.start_time;
                            return (
                              <button
                                key={slot.start_time}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-all text-center ${
                                  isSelected
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50/50'
                                }`}
                              >
                                {slot.formatted_time}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Time Preview */}
              {(selectedSlot || customTime) && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center space-x-2">
                  <CalendarClock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    New time selected:{' '}
                    <strong>
                      {selectedSlot
                        ? `${format(parseISO(selectedSlot.start_time), 'EEE, MMM dd, yyyy')} at ${selectedSlot.formatted_time}`
                        : format(new Date(customTime), 'EEE, MMM dd, yyyy @ hh:mm a')}
                    </strong>
                  </span>
                </div>
              )}

              {rescheduleError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                  {rescheduleError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReschedulingBooking(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Keep Current Time
                </button>
                <button
                  type="submit"
                  disabled={rescheduleMutation.isPending || (!selectedSlot && !customTime) || !rescheduleReason.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
                >
                  {rescheduleMutation.isPending ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
