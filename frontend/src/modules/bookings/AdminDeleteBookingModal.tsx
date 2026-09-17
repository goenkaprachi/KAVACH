import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface AdminDeleteBookingModalProps {
  booking: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AdminDeleteBookingModal: React.FC<AdminDeleteBookingModalProps> = ({
  booking,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await api.delete(`/admin/bookings/${bookingId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      setError(null);
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Failed to delete meeting. Please try again.');
    },
  });

  if (!isOpen || !booking) return null;

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault();
    deleteMutation.mutate(booking.id);
  };

  const invitee = booking.invitees?.[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet max-w-md p-6 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2.5 text-red-600">
            <div className="p-2 bg-red-100 rounded-xl">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Permanently Delete Meeting</h3>
              <p className="text-xs text-slate-500">Database hard deletion (Admin)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleDelete} className="mt-4 space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start space-x-2.5">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">This action cannot be undone!</p>
              <p className="text-red-700 leading-relaxed">
                This meeting record will be permanently purged from the database, along with all attendee details, join links, and audit history.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500">Meeting ID:</span>
              <span className="font-mono font-bold text-slate-900">
                {booking.booking_reference || booking.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Event:</span>
              <span className="font-semibold text-slate-900">
                {booking.event_type_title || 'Meeting'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Attendee:</span>
              <span className="font-medium text-slate-800">
                {invitee?.name || 'N/A'} ({invitee?.email || 'N/A'})
              </span>
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Keep Meeting
            </button>
            <button
              type="submit"
              disabled={deleteMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors inline-flex items-center space-x-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
