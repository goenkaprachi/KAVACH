import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  Clock,
  Video,
  User,
  ShieldCheck,
  Filter,
  Phone,
  Mail,
  Copy,
  Check,
  History,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { MeetingDetailsModal, getAttendeePhone } from '../bookings/MeetingDetailsModal';
import { AdminDeleteBookingModal } from '../bookings/AdminDeleteBookingModal';

export const AdminBookings: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['admin-bookings', statusFilter, providerFilter],
    queryFn: async () => {
      const res = await api.get('/admin/bookings', {
        params: {
          status: statusFilter || undefined,
          provider: providerFilter || undefined,
        },
      });
      return res.data;
    },
  });

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter out legacy duplicate cancelled records from before single-record update
  const displayBookings = bookings.filter((b: any) => {
    return !(b.status === 'cancelled' && b.cancellation_reason?.startsWith('Rescheduled'));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Organization-Wide Bookings</h1>
          <p className="text-sm text-slate-500">
            Audit, inspect attendee details, review change logs, and manage every scheduled meeting across staff
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center space-x-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Providers</option>
            <option value="jitsi">Jitsi Meet</option>
            <option value="google_meet">Google Meet</option>
            <option value="zoom">Zoom</option>
            <option value="phone">Phone</option>
            <option value="in_person">In Person</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse h-64" />
      ) : displayBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <Calendar className="h-12 w-12 text-slate-400 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">No bookings found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Scheduled meetings matching the selected filters will appear in this audit list.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Meeting ID
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Host Employee
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Attendee / Contact
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Event Type
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {displayBookings.map((b: any) => {
                  const startDt = parseISO(b.start_time);
                  const inv = b.invitees?.[0];
                  const phone = getAttendeePhone(inv);
                  const refId = b.booking_reference || b.id.slice(0, 8);
                  const isCopied = copiedId === refId;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Meeting ID */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs font-mono">
                        <div className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200/80 px-2 py-1 rounded text-slate-700">
                          <span className="font-semibold">{refId}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyId(e, refId)}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                            title="Copy Meeting ID"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-800 font-medium">
                        <div className="font-semibold text-slate-900">{format(startDt, 'dd MMM yyyy')}</div>
                        <div className="text-slate-500 font-normal">{format(startDt, 'hh:mm a')}</div>
                      </td>

                      {/* Host */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs font-semibold text-slate-900">
                        {b.employee_name || 'Staff'}
                      </td>

                      {/* Attendee Details */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-700">
                        <div className="font-semibold text-slate-900">{inv?.name || 'N/A'}</div>
                        <div className="text-slate-500">{inv?.email}</div>
                        {phone && (
                          <div className="mt-0.5">
                            <a
                              href={`tel:${phone}`}
                              className="inline-flex items-center space-x-1 font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px] hover:underline"
                            >
                              <Phone className="h-3 w-3 text-emerald-600" />
                              <span>{phone}</span>
                            </a>
                          </div>
                        )}
                      </td>

                      {/* Event Type */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-800">
                        <span className="font-medium">{b.event_type_title || 'Meeting'}</span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${
                            b.status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-right text-xs">
                        <div className="inline-flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setDetailsBooking(b)}
                            className="inline-flex items-center space-x-1 text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            title="View Meeting Details & Change Logs"
                          >
                            <History className="h-3.5 w-3.5 text-slate-500" />
                            <span>Logs</span>
                          </button>

                          {b.meeting_join_url && b.status === 'confirmed' && (
                            <a
                              href={b.meeting_join_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                              title="Join Video Room"
                            >
                              <Video className="h-3.5 w-3.5" />
                              <span>Join</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => setDeletingBooking(b)}
                            className="inline-flex items-center space-x-1 text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            title="Hard delete from database"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Meeting Details & Logs Modal */}
      <MeetingDetailsModal
        booking={detailsBooking}
        isOpen={!!detailsBooking}
        onClose={() => setDetailsBooking(null)}
        onOpenDelete={(b) => setDeletingBooking(b)}
        isAdmin={true}
      />

      {/* Admin Delete Confirmation Modal */}
      <AdminDeleteBookingModal
        booking={deletingBooking}
        isOpen={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
      />
    </div>
  );
};
