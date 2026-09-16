import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Video, User, ShieldCheck, Filter } from 'lucide-react';

export const AdminBookings: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Organization-Wide Bookings</h1>
          <p className="text-sm text-slate-500">
            Audit and inspect every scheduled meeting across all staff members
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center space-x-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
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
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse h-64" />
      ) : bookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Calendar className="h-12 w-12 text-slate-400 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">No bookings found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Scheduled meetings matching the selected filters will appear in this audit list.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Host Employee
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Invitee
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Event
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Meeting Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {bookings.map((b: any) => {
                const startDt = parseISO(b.start_time);
                const inv = b.invitees?.[0];
                return (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-800 font-medium">
                      <div>{format(startDt, 'dd MMM yyyy')}</div>
                      <div className="text-slate-500 font-normal">{format(startDt, 'hh:mm a')}</div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-900">
                      {b.employee_name || 'Staff'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700">
                      <div className="font-semibold text-slate-800">{inv?.name || 'N/A'}</div>
                      <div className="text-slate-500">{inv?.email}</div>
                      {inv?.custom_answers && (
                        <div className="text-[11px] text-slate-500 space-x-1 pt-0.5">
                          {inv.custom_answers['Company name'] && (
                            <span className="font-medium text-slate-700">{inv.custom_answers['Company name']} • </span>
                          )}
                          {inv.custom_answers['Contact No.'] && (
                            <span>{inv.custom_answers['Contact No.']}</span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-800">
                      {b.event_type_title || 'Meeting'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 capitalize">
                      {b.meeting_provider?.replace('_', ' ')}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          b.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      {b.meeting_join_url ? (
                        <a
                          href={b.meeting_join_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          <Video className="h-3.5 w-3.5" />
                          <span>Join Room</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
