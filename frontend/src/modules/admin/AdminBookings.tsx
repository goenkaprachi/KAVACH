import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  Clock,
  Video,
  Phone,
  Mail,
  Building,
  Copy,
  Check,
  History,
  Trash2,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  Search,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { MeetingDetailsModal } from '../bookings/MeetingDetailsModal';
import { getAttendeePhone } from '../../lib/utils';
import { AdminDeleteBookingModal } from '../bookings/AdminDeleteBookingModal';
import { StatusBadge } from '../../components/StatusBadge';
import { Card } from '../../components/Card';

export const AdminBookings: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const { data: bookings = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-bookings', statusFilter, providerFilter],
    queryFn: async () => {
      const res = await api.get('/admin/bookings', {
        params: { status: statusFilter || undefined, provider: providerFilter || undefined },
      });
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

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter legacy duplicate cancelled records
  const displayBookings = bookings.filter((b: any) =>
    !(b.status === 'cancelled' && b.cancellation_reason?.startsWith('Rescheduled'))
  );

  const filteredBookings = displayBookings.filter((b: any) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const inv = b.invitees?.[0];
    const name = (inv?.name || '').toLowerCase();
    const email = (inv?.email || '').toLowerCase();
    const staff = (b.employee_name || '').toLowerCase();
    const event = (b.event_type_title || '').toLowerCase();
    const ref = (b.booking_reference || b.id || '').toLowerCase();
    return name.includes(term) || email.includes(term) || staff.includes(term) || event.includes(term) || ref.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Orion Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Organization Meetings</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                {displayBookings.length}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              All scheduled meetings across staff with full attendee details and audit access
            </p>
          </div>
        </div>
      </div>

      {/* Orion Filter Toolbar Card */}
      <Card className="p-3.5 bg-white/90 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by attendee, email, staff, or ID..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-slate-900"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
            >
              <option value="">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
            >
              <option value="">All Platforms</option>
              <option value="jitsi">Jitsi Meet</option>
              <option value="google_meet">Google Meet</option>
              <option value="zoom">Zoom</option>
              <option value="phone">Phone</option>
              <option value="in_person">In Person</option>
            </select>
            {(searchTerm || statusFilter || providerFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('');
                  setProviderFilter('');
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              disabled={isManualRefreshing || isFetching}
              onClick={handleManualRefresh}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs hover:border-slate-300 transition-all disabled:opacity-75 cursor-pointer ml-auto sm:ml-0"
              title="Refresh Meetings"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-cyan-600 ${
                  isManualRefreshing || isFetching ? 'animate-spin' : ''
                }`}
              />
              <span>{isManualRefreshing || isFetching ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <Card className="p-0 overflow-hidden bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border-b border-slate-100 last:border-b-0 p-4 flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-100 rounded w-40 animate-pulse" />
                <div className="h-3 bg-slate-100 rounded w-56 animate-pulse" />
              </div>
              <div className="w-24 h-8 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </Card>
      ) : filteredBookings.length === 0 ? (
        <Card className="p-12 text-center bg-white border border-slate-200/90 shadow-xs">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">No meetings found</h3>
          <p className="mt-1 text-xs text-slate-500">Meetings matching the selected filters will appear here.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Attendee</th>
                  <th className="px-5 py-3.5">Host</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Event Type</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredBookings.map((b: any, idx: number) => {
                  const startDt = parseISO(b.start_time);
                  const endDt = parseISO(b.end_time);
                  const inv = b.invitees?.[0];
                  const refId = b.booking_reference || b.id.slice(0, 8);
                  const isCopied = copiedId === refId;
                  const isConfirmed = b.status === 'confirmed';

                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetailsBooking(b)}
                      className={`hover:bg-slate-50/75 transition-colors cursor-pointer ${
                        idx % 2 !== 0 ? 'bg-slate-50/20' : ''
                      }`}
                    >
                      {/* COL 1: Attendee */}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-cyan-500/15 to-sky-500/15 border border-cyan-500/20 text-cyan-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {inv?.name ? inv.name.charAt(0).toUpperCase() : 'A'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-sm truncate hover:text-cyan-700 transition-colors">
                              {inv?.name || <span className="text-slate-400 italic font-normal">Unknown</span>}
                            </div>
                            {inv?.email && (
                              <div className="text-xs text-slate-500 truncate mt-0.5">
                                {inv.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* COL 2: Host */}
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-800">
                          {b.employee_name || 'Staff'}
                        </span>
                      </td>

                      {/* COL 3: Date & Time */}
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-800">
                          {format(startDt, 'dd MMM yyyy')}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {format(startDt, 'hh:mm a')} – {format(endDt, 'hh:mm a')}
                        </div>
                      </td>

                      {/* COL 4: Event Type & ID */}
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {Boolean(b.event_type_id) ? 'Meeting with Kavach' : (b.title || b.event_type_title || 'Meeting')}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <span className="font-mono text-[11px] text-slate-400">
                            {refId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyId(e, refId)}
                            className="text-slate-400 hover:text-cyan-600 transition-colors"
                            title="Copy meeting ID"
                          >
                            {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>

                      {/* COL 5: Status */}
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <StatusBadge
                          status={
                            b.status === 'cancelled'
                              ? 'cancelled'
                              : (b.is_rescheduled || b.rescheduled_from_id)
                              ? 'rescheduled'
                              : b.status
                          }
                          label={
                            b.status === 'cancelled'
                              ? 'Cancelled'
                              : (b.is_rescheduled || b.rescheduled_from_id)
                              ? 'Rescheduled'
                              : undefined
                          }
                          dot
                        />
                        {b.cancellation_reason && !b.cancellation_reason.startsWith('Rescheduled') && (
                          <div className="text-[10px] text-rose-500 mt-1 max-w-[140px] truncate" title={b.cancellation_reason}>
                            {b.cancellation_reason}
                          </div>
                        )}
                      </td>

                      {/* COL 6: Actions */}
                      <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isConfirmed && b.meeting_join_url && (
                            <a
                              href={b.meeting_join_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Join
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailsBooking(b)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors shadow-2xs"
                            title="View details & audit logs"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingBooking(b)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Permanently delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <MeetingDetailsModal
        booking={detailsBooking}
        isOpen={!!detailsBooking}
        onClose={() => setDetailsBooking(null)}
        onOpenDelete={(b) => setDeletingBooking(b)}
        isAdmin={true}
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
    </div>
  );
};
