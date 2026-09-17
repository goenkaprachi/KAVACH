import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import {
  X,
  Calendar,
  Clock,
  Video,
  User,
  Mail,
  Phone,
  Building,
  History,
  Copy,
  Check,
  ExternalLink,
  CalendarClock,
  XCircle,
  Trash2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface MeetingDetailsModalProps {
  booking: any | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenReschedule?: (booking: any) => void;
  onOpenCancel?: (booking: any) => void;
  onOpenDelete?: (booking: any) => void;
  isAdmin?: boolean;
}

export const getAttendeePhone = (invitee: any): string | null => {
  if (!invitee?.custom_answers) return null;
  const answers = invitee.custom_answers;
  const phoneKeys = [
    'contact no.',
    'contact number',
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'contact',
    'telephone',
    'cell',
  ];
  for (const [key, val] of Object.entries(answers)) {
    if (phoneKeys.includes(key.toLowerCase().trim()) && val) {
      return String(val).trim();
    }
  }
  return null;
};

export const MeetingDetailsModal: React.FC<MeetingDetailsModalProps> = ({
  booking,
  isOpen,
  onClose,
  onOpenReschedule,
  onOpenCancel,
  onOpenDelete,
  isAdmin = false,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch change logs / audit trail for this specific booking
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['booking-logs', booking?.id],
    queryFn: async () => {
      if (!booking?.id) return [];
      const res = await api.get(`/bookings/${booking.id}/logs`);
      return res.data;
    },
    enabled: isOpen && !!booking?.id,
  });

  if (!isOpen || !booking) return null;

  const startDt = parseISO(booking.start_time);
  const endDt = parseISO(booking.end_time);
  const invitee = booking.invitees?.[0];
  const phone = getAttendeePhone(invitee);

  const copyToClipboard = (text: string, type: 'ref' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'ref') {
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const getLogIcon = (action: string) => {
    switch (action) {
      case 'booking.created':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'booking.rescheduled':
        return <CalendarClock className="h-4 w-4 text-blue-600" />;
      case 'booking.cancelled':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <History className="h-4 w-4 text-slate-500" />;
    }
  };

  const otherAnswers = invitee?.custom_answers
    ? Object.entries(invitee.custom_answers).filter(([k]) => {
        const lower = k.toLowerCase().trim();
        return (
          !['company name', 'contact no.', 'contact number', 'phone', 'mobile'].includes(lower)
        );
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full my-8 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-lg font-bold text-slate-900">
                {booking.event_type_title || 'Meeting Details'}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                  booking.status === 'confirmed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : booking.cancellation_reason?.startsWith('Rescheduled')
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {booking.status === 'cancelled' && booking.cancellation_reason?.startsWith('Rescheduled')
                  ? 'Rescheduled'
                  : booking.status}
              </span>
            </div>

            <div className="flex items-center space-x-2 mt-2">
              <span className="text-xs font-mono bg-slate-200/80 px-2 py-0.5 rounded text-slate-700 font-semibold flex items-center space-x-1">
                <span>Ref:</span>
                <span>{booking.booking_reference || booking.id.slice(0, 8)}</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(booking.booking_reference || booking.id, 'ref')
                }
                className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center space-x-1 font-medium transition-colors"
                title="Copy Meeting Reference"
              >
                {copiedRef ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Copied ID!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5 p-3 bg-blue-50/40 border border-blue-100 rounded-xl">
            {booking.status === 'confirmed' && booking.meeting_join_url && (
              <a
                href={booking.meeting_join_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Video className="h-4 w-4" />
                <span>Join Meeting Room</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {booking.status === 'confirmed' && onOpenReschedule && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenReschedule(booking);
                }}
                className="inline-flex items-center space-x-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <span>Reschedule Meeting</span>
              </button>
            )}

            {booking.status === 'confirmed' && onOpenCancel && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCancel(booking);
                }}
                className="inline-flex items-center space-x-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-300 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <XCircle className="h-4 w-4 text-red-500" />
                <span>Cancel Meeting</span>
              </button>
            )}

            {isAdmin && onOpenDelete && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDelete(booking);
                }}
                className="inline-flex items-center space-x-1.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-600 hover:text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors ml-auto"
                title="Permanently remove from database (Admin only)"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Meeting (Admin)</span>
              </button>
            )}
          </div>

          {/* Cancellation Banner if cancelled */}
          {booking.cancellation_reason && (
            <div
              className={`p-3.5 rounded-xl border flex items-start space-x-2.5 text-xs ${
                booking.cancellation_reason.startsWith('Rescheduled')
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <AlertCircle
                className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                  booking.cancellation_reason.startsWith('Rescheduled')
                    ? 'text-amber-600'
                    : 'text-red-600'
                }`}
              />
              <div>
                <span className="font-bold">
                  {booking.cancellation_reason.startsWith('Rescheduled')
                    ? 'Rescheduling Note:'
                    : 'Cancellation Reason:'}
                </span>{' '}
                {booking.cancellation_reason.replace(/^Rescheduled:\s*/, '')}
                {booking.cancelled_by && (
                  <div className="text-[11px] text-slate-500 mt-1 capitalize">
                    Initiated by: {booking.cancelled_by}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Grid Information: Schedule & Attendee */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Schedule Details Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span>Schedule & Location</span>
              </h3>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Date</span>
                  <span className="font-semibold text-slate-800">
                    {format(startDt, 'EEEE, MMMM dd, yyyy')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Time</span>
                  <span className="font-semibold text-slate-800 flex items-center space-x-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      {format(startDt, 'hh:mm a')} – {format(endDt, 'hh:mm a')}
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      ({Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'})
                    </span>
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Host</span>
                  <span className="font-semibold text-slate-800">
                    {booking.employee_name || 'Assigned Staff'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Platform</span>
                  <span className="inline-flex items-center space-x-1 font-semibold text-slate-800 capitalize">
                    <Video className="h-3.5 w-3.5 text-blue-500" />
                    <span>{booking.meeting_provider?.replace('_', ' ') || 'Online'}</span>
                  </span>
                </div>

                {booking.meeting_join_url && (
                  <div className="pt-1">
                    <span className="text-slate-500 block text-[11px]">Meeting URL</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={booking.meeting_join_url}
                        className="text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 w-full truncate focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(booking.meeting_join_url, 'link')}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center space-x-1"
                        title="Copy meeting link"
                      >
                        {copiedLink ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Attendee Details Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <User className="h-3.5 w-3.5 text-purple-600" />
                <span>Attendee Information</span>
              </h3>

              {invitee ? (
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Full Name</span>
                    <span className="font-semibold text-slate-900 text-sm">
                      {invitee.name}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Email Address</span>
                    <a
                      href={`mailto:${invitee.email}`}
                      className="font-medium text-blue-600 hover:underline flex items-center space-x-1"
                    >
                      <Mail className="h-3 w-3" />
                      <span>{invitee.email}</span>
                    </a>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Contact Number</span>
                    {phone ? (
                      <a
                        href={`tel:${phone}`}
                        className="font-semibold text-emerald-700 flex items-center space-x-1.5 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{phone}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 italic">Not provided</span>
                    )}
                  </div>

                  {invitee.custom_answers?.['Company name'] && (
                    <div>
                      <span className="text-slate-500 block text-[11px]">Company</span>
                      <span className="font-semibold text-slate-800 flex items-center space-x-1">
                        <Building className="h-3.5 w-3.5 text-slate-400" />
                        <span>{invitee.custom_answers['Company name']}</span>
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-500 block text-[11px]">Timezone</span>
                    <span className="text-slate-700">{invitee.timezone || 'UTC'}</span>
                  </div>

                  {otherAnswers.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 block text-[11px] mb-1 font-semibold">
                        Additional Responses:
                      </span>
                      <div className="space-y-1">
                        {otherAnswers.map(([k, v]) => (
                          <div key={k} className="bg-white p-1.5 rounded border border-slate-200 text-[11px]">
                            <span className="font-semibold text-slate-700">{k}: </span>
                            <span className="text-slate-600">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-2">
                  No invitee details recorded.
                </div>
              )}
            </div>
          </div>

          {/* Change Logs / Audit Trail */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                <History className="h-4 w-4 text-blue-600" />
                <span>Meeting Change Logs & Audit History</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Single record maintained per meeting
              </span>
            </div>

            {loadingLogs ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                No change logs found for this meeting.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {logs.map((log: any, idx: number) => {
                  const logDate = parseISO(log.created_at);
                  const isRescheduled = log.action === 'booking.rescheduled';
                  const isCancelled = log.action === 'booking.cancelled';
                  const isCreated = log.action === 'booking.created';

                  return (
                    <div key={log.id || idx} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-6 top-1 h-5 w-5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                        {getLogIcon(log.action)}
                      </div>

                      <div className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl p-3 text-xs transition-colors space-y-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold capitalize ${
                              isCreated
                                ? 'text-emerald-700'
                                : isRescheduled
                                ? 'text-blue-700'
                                : isCancelled
                                ? 'text-red-700'
                                : 'text-slate-800'
                            }`}
                          >
                            {isCreated
                              ? 'Booking Created'
                              : isRescheduled
                              ? 'Meeting Rescheduled'
                              : isCancelled
                              ? 'Meeting Cancelled'
                              : log.action.replace('.', ' ')}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {format(logDate, 'dd MMM yyyy, hh:mm a')}
                          </span>
                        </div>

                        <p className="text-slate-700 text-xs leading-relaxed">
                          {log.description}
                        </p>

                        {/* Additional Metadata Details */}
                        {isRescheduled && log.metadata?.previous_start_time && log.metadata?.new_start_time && (
                          <div className="mt-1.5 p-2 bg-white rounded border border-slate-200 text-[11px] space-y-0.5">
                            <div className="text-slate-500">
                              Original: <span className="line-through">{format(parseISO(log.metadata.previous_start_time), 'EEE, dd MMM yyyy @ hh:mm a')}</span>
                            </div>
                            <div className="text-emerald-700 font-semibold">
                              New Time: {format(parseISO(log.metadata.new_start_time), 'EEE, dd MMM yyyy @ hh:mm a')}
                            </div>
                            {log.metadata?.reason && (
                              <div className="text-slate-600 pt-0.5">
                                <span className="font-semibold">Reason:</span> {log.metadata.reason}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-[10px] text-slate-400 pt-0.5">
                          Actor: <span className="font-medium text-slate-600">{log.actor_name || log.actor_type || 'System'}</span> ({log.actor_type || 'User'})
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg text-xs hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
