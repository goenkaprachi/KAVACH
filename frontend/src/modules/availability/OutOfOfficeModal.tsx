import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format, addDays, parseISO } from 'date-fns';
import {
  CalendarOff,
  Clock,
  AlertTriangle,
  CheckCircle2,
  X,
  Mail,
  User,
  RefreshCw,
  Send,
  Calendar as CalendarIcon,
} from 'lucide-react';

interface OutOfOfficeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  onSuccess?: () => void;
}

export const OutOfOfficeModal: React.FC<OutOfOfficeModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const defaultDate = initialDate || format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(defaultDate);
  const [customMessage, setCustomMessage] = useState<string>('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  // 1. Fetch live preview of confirmed bookings on the selected date
  const {
    data: preview,
    isLoading: loadingPreview,
    isFetching: fetchingPreview,
  } = useQuery({
    queryKey: ['out-of-office-preview', selectedDate],
    queryFn: async () => {
      const res = await api.get('/availability/out-of-office/preview', {
        params: { date: selectedDate },
      });
      return res.data;
    },
    enabled: isOpen && !!selectedDate,
  });

  // 2. Mark Out of Office Mutation
  const markMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/availability/out-of-office', {
        date: selectedDate,
        custom_message: customMessage.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['availability-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['employee-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['out-of-office-preview', selectedDate] });

      const msg = data.cancelled_bookings_count > 0
        ? `Marked as Out of Office! ${data.cancelled_bookings_count} meeting(s) cancelled and invitees notified.`
        : 'Marked as Out of Office! Your calendar is now blocked for new bookings.';
      setStatusSuccess(msg);
      setStatusError(null);

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        setStatusSuccess(null);
        onClose();
      }, 2200);
    },
    onError: (err: any) => {
      setStatusError(
        err.response?.data?.detail || 'Failed to mark out of office. Please try again.'
      );
    },
  });

  if (!isOpen) return null;

  const bookingsCount = preview?.bookings_count ?? 0;
  const bookingsList = preview?.bookings ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <CalendarOff className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Mark Out of Office (Leave)</h3>
              <p className="text-xs text-rose-100 mt-0.5">
                Block your calendar & automatically cancel meetings for the day
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={markMutation.isPending}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Success Banner */}
          {statusSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-3 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{statusSuccess}</span>
            </div>
          )}

          {/* Error Banner */}
          {statusError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800 text-xs font-semibold">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{statusError}</span>
            </div>
          )}

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Select Leave Date
            </label>
            <div className="relative">
              <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="date"
                required
                value={selectedDate}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setStatusError(null);
                  setStatusSuccess(null);
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-800">
                  Meeting Impact Preview
                </span>
              </div>
              {fetchingPreview && (
                <span className="inline-flex items-center text-[11px] text-cyan-600 font-medium">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Checking schedule...
                </span>
              )}
            </div>

            {loadingPreview ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Checking for existing meetings on this date...
              </div>
            ) : bookingsCount === 0 ? (
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg flex items-center space-x-2.5 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>No meetings booked</strong> on {selectedDate}. Marking this day will block new bookings.
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-xs text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      {bookingsCount} meeting{bookingsCount > 1 ? 's' : ''} will be auto-cancelled:
                    </span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Each invitee will receive an email cancellation notice with your custom message and a 1-click reschedule link to pick a new slot.
                    </p>
                  </div>
                </div>

                {/* List of Affected Bookings */}
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden max-h-44 overflow-y-auto">
                  {bookingsList.map((b: any) => {
                    const sTime = parseISO(b.start_time);
                    const eTime = parseISO(b.end_time);
                    const inviteeStr = b.invitee_names?.join(', ') || 'Invitee';
                    const emailStr = b.invitee_emails?.join(', ') || '';

                    return (
                      <div key={b.id} className="p-2.5 text-xs flex items-center justify-between hover:bg-slate-50">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900">{b.title}</p>
                          <p className="text-[11px] text-slate-500 flex items-center space-x-2">
                            <span>{format(sTime, 'h:mm a')} – {format(eTime, 'h:mm a')}</span>
                            <span>•</span>
                            <span className="font-medium text-slate-700">{inviteeStr}</span>
                            {emailStr && <span className="text-slate-400">({emailStr})</span>}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                          To be cancelled
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Optional Custom Message */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Custom Message to Invitees (Optional)
              </label>
              <span className="text-[11px] text-slate-400">
                Included in cancellation & reschedule emails
              </span>
            </div>
            <textarea
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="e.g., I am unexpectedly out of office today and unable to join. Please use the reschedule link in this email to pick another time that works best for you!"
              className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 shadow-2xs placeholder:text-slate-400"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Invitees will receive this message alongside a direct, self-service link to pick a new available slot without needing an account.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={markMutation.isPending}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={markMutation.isPending || loadingPreview}
            onClick={() => markMutation.mutate()}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 ${
              bookingsCount > 0
                ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 shadow-rose-500/20'
                : 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 shadow-amber-500/20'
            }`}
          >
            {markMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Cancelling & Notifying...</span>
              </>
            ) : (
              <>
                <CalendarOff className="h-4 w-4" />
                <span>
                  {bookingsCount > 0
                    ? `Confirm Leave & Cancel ${bookingsCount} Meeting${bookingsCount > 1 ? 's' : ''}`
                    : 'Mark Out of Office'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
