import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { COMMON_TIMEZONES } from '../../lib/utils';
import {
  Users, 
  UserPlus, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  Clock, 
  Copy, 
  Check, 
  ExternalLink,
  X,
  RefreshCw
} from 'lucide-react';
import { Card } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';

export const AdminEmployees: React.FC = () => {
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Invite Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [lastInvited, setLastInvited] = useState<any | null>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const res = await api.get('/admin/employees');
      return res.data;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/admin/employees', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      setLastInvited(data);
      setName('');
      setEmail('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return await api.patch(`/admin/employees/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
    },
  });

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(token);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({
      name,
      email,
      role,
      timezone,
    });
  };

  return (
    <div className="space-y-6">
      {/* Orion Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Employees</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-cyan-100 text-cyan-700 border border-cyan-200">
                {employees.length} Members
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Admin oversight: onboard staff, manage permissions, and track booking activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLastInvited(null);
              setIsInviteOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Employee</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center text-sm font-medium text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-cyan-600" />
          Loading Employee Roster...
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Availability
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Bookings
                </th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {employees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                        {emp.name ? emp.name.charAt(0).toUpperCase() : emp.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{emp.name || 'Invited User'}</div>
                        <div className="text-xs text-slate-500">{emp.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        emp.role === 'admin'
                          ? 'bg-purple-100 text-purple-800 font-semibold'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {emp.role}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        emp.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : emp.status === 'pending'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {emp.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="flex items-center text-xs text-slate-600">
                      {emp.has_availability ? (
                        <span className="flex items-center text-emerald-600 font-medium">
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Configured
                        </span>
                      ) : (
                        <span className="flex items-center text-amber-600 font-medium">
                          <Clock className="h-4 w-4 mr-1" /> Not Set Up
                        </span>
                      )}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-semibold">
                    {emp.booking_count}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right text-xs space-x-2">
                    {emp.status === 'pending' && emp.invite_token && (
                      <button
                        onClick={() => copyInviteLink(emp.invite_token)}
                        className="inline-flex items-center space-x-1 text-purple-600 hover:text-purple-800 font-semibold px-2 py-1 bg-purple-50 rounded"
                        title="Copy Invitation Link"
                      >
                        {copiedLink === emp.invite_token ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>Invite Link</span>
                      </button>
                    )}

                    <button
                      onClick={() =>
                        updateMutation.mutate({
                          id: emp.id,
                          updates: { role: emp.role === 'admin' ? 'employee' : 'admin' },
                        })
                      }
                      className="text-slate-600 hover:text-slate-900 font-medium px-2 py-1 bg-slate-100 rounded"
                    >
                      {emp.role === 'admin' ? 'Demote' : 'Promote Admin'}
                    </button>

                    <button
                      onClick={() =>
                        updateMutation.mutate({
                          id: emp.id,
                          updates: {
                            status: emp.status === 'deactivated' ? 'active' : 'deactivated',
                          },
                        })
                      }
                      className={`font-medium px-2 py-1 rounded ${
                        emp.status === 'deactivated'
                          ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          : 'text-red-700 bg-red-50 hover:bg-red-100'
                      }`}
                    >
                      {emp.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="modal-overlay" onClick={() => setIsInviteOpen(false)}>
          <div className="modal-sheet max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Invite Team Member</h3>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {lastInvited ? (
              <div className="mt-4 space-y-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-slate-900 text-sm">Invitation Dispatched!</h4>
                <p className="text-xs text-slate-600">
                  An email was sent to <strong>{lastInvited.email}</strong>. You can also copy the direct invitation link below:
                </p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-mono break-all text-left">
                  <span>{`${window.location.origin}/accept-invite?token=${lastInvited.invite_token}`}</span>
                  <button
                    onClick={() => copyInviteLink(lastInvited.invite_token)}
                    className="ml-2 p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="w-full mt-2 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="employee@kavach.infra"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50"
                  >
                    {inviteMutation.isPending ? 'Sending Invite...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
