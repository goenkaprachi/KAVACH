import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { format, parseISO, isPast, isToday, differenceInDays, differenceInHours } from 'date-fns';
import { Card } from '../components/Card';
import { MeetingOutcomeModal } from '../modules/bookings/MeetingOutcomeModal';
import { MeetingDetailsModal } from '../modules/bookings/MeetingDetailsModal';
import {
  BellRing,
  CheckCircle2,
  Clock,
  Calendar,
  AlertTriangle,
  Search,
  X,
  Filter,
  RefreshCw,
  ListTodo,
  ExternalLink,
  ChevronRight,
  Sparkles,
  User,
  Building,
  Flag,
  Edit,
  CheckSquare,
  Square,
  History,
  Zap,
  Play,
  Plus,
  Trash2,
  Mail,
  ToggleLeft,
  ToggleRight,
  Send,
  ShieldCheck,
  Check,
  AlertCircle,
} from 'lucide-react';

type MainTab = 'workflows' | 'followups' | 'logs';
type TimeframeFilter = 'all' | 'overdue' | 'today' | 'upcoming';
type StatusFilter = 'all' | 'pending' | 'completed';

export const RemindersPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<MainTab>('workflows');

  // Follow-up tab states
  const [searchTerm, setSearchTerm] = useState('');
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);

  // Workflow tab states
  const [isCreateWfOpen, setIsCreateWfOpen] = useState(false);
  const [wfName, setWfName] = useState('');
  const [wfTriggerType, setWfTriggerType] = useState('before_event');
  const [wfOffsetAmount, setWfOffsetAmount] = useState(24);
  const [wfOffsetUnit, setWfOffsetUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [wfActionType, setWfActionType] = useState('email_attendee');
  const [wfEventTypeId, setWfEventTypeId] = useState('');

  // Test Email state
  const [testingWorkflow, setTestingWorkflow] = useState<any | null>(null);
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [manualRunFeedback, setManualRunFeedback] = useState<string | null>(null);

  // --- Queries ---
  // 1. Follow-up reminders
  const { data: reminders = [], isLoading: loadingReminders, refetch: refetchReminders } = useQuery({
    queryKey: ['reminders-list'],
    queryFn: async () => {
      const res = await api.get('/bookings/reminders/list', {
        params: { status: 'all', timeframe: 'all' },
      });
      return res.data;
    },
  });

  // 2. Workflows
  const { data: workflows = [], isLoading: loadingWorkflows, refetch: refetchWorkflows } = useQuery({
    queryKey: ['workflows-list'],
    queryFn: async () => {
      const res = await api.get('/workflows');
      return res.data;
    },
  });

  // 3. Workflow delivery logs
  const { data: deliveryLogs = [], isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['workflows-logs'],
    queryFn: async () => {
      const res = await api.get('/workflows/logs/history', { params: { limit: 50 } });
      return res.data;
    },
  });

  // 4. Event types (for scoping workflows)
  const { data: eventTypes = [] } = useQuery({
    queryKey: ['event-types'],
    queryFn: async () => {
      const res = await api.get('/event-types');
      return res.data;
    },
  });

  // --- Mutations ---
  // Toggle workflow active state
  const toggleWfMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await api.patch(`/workflows/${id}`, { is_active });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows-list'] });
    },
  });

  // Create workflow
  const createWfMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/workflows', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows-list'] });
      setIsCreateWfOpen(false);
      resetCreateForm();
    },
  });

  // Delete workflow
  const deleteWfMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/workflows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows-list'] });
    },
  });

  // Run Now manual trigger
  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/workflows/run-now');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflows-logs'] });
      setManualRunFeedback(`Evaluation completed! ${data.sent_count} reminder(s) sent.`);
      setTimeout(() => setManualRunFeedback(null), 5000);
    },
  });

  // Test email mutation
  const testWfMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const res = await api.post(`/workflows/${id}/test`, { recipient_email: email });
      return res.data;
    },
    onSuccess: () => {
      setTestFeedback({ type: 'success', text: `Test reminder dispatched to ${testRecipientEmail}!` });
      setTimeout(() => {
        setTestingWorkflow(null);
        setTestFeedback(null);
        setTestRecipientEmail('');
      }, 2500);
    },
    onError: (err: any) => {
      setTestFeedback({ type: 'error', text: err.response?.data?.detail || 'Failed to dispatch test email.' });
    },
  });

  // Follow-up toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const res = await api.patch(`/bookings/${id}/followup-status`, {
        followup_status: newStatus,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders-list'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-all'] });
    },
  });

  const now = new Date();

  // Metrics for follow-ups
  const metrics = useMemo(() => {
    const total = reminders.length;
    const pending = reminders.filter((r: any) => r.followup_status !== 'completed').length;
    const overdue = reminders.filter((r: any) => {
      if (r.followup_status === 'completed' || !r.followup_date) return false;
      return isPast(parseISO(r.followup_date));
    }).length;
    const completed = reminders.filter((r: any) => r.followup_status === 'completed').length;
    return { total, pending, overdue, completed };
  }, [reminders]);

  const activeWorkflowsCount = useMemo(() => {
    return workflows.filter((w: any) => w.is_active).length;
  }, [workflows]);

  const resetCreateForm = () => {
    setWfName('');
    setWfTriggerType('before_event');
    setWfOffsetAmount(24);
    setWfOffsetUnit('hours');
    setWfActionType('email_attendee');
    setWfEventTypeId('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let totalMinutes = Number(wfOffsetAmount);
    if (wfOffsetUnit === 'hours') totalMinutes *= 60;
    if (wfOffsetUnit === 'days') totalMinutes *= 1440;

    createWfMutation.mutate({
      name: wfName.trim(),
      trigger_type: wfTriggerType,
      offset_minutes: totalMinutes,
      action_type: wfActionType,
      event_type_id: wfEventTypeId || null,
      is_active: true,
    });
  };

  // Follow-up filtering
  const filteredReminders = useMemo(() => {
    return reminders.filter((r: any) => {
      if (statusFilter === 'pending' && r.followup_status === 'completed') return false;
      if (statusFilter === 'completed' && r.followup_status !== 'completed') return false;

      if (r.followup_date) {
        const dt = parseISO(r.followup_date);
        if (timeframe === 'overdue') {
          if (!isPast(dt) || r.followup_status === 'completed') return false;
        } else if (timeframe === 'today') {
          if (!isToday(dt)) return false;
        } else if (timeframe === 'upcoming') {
          if (isPast(dt)) return false;
        }
      } else if (timeframe !== 'all') {
        return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const title = (r.title || r.event_type_title || '').toLowerCase();
        const attendee = (r.invitees?.[0]?.name || '').toLowerCase();
        const email = (r.invitees?.[0]?.email || '').toLowerCase();
        const notes = (r.followup_notes || '').toLowerCase();
        const outcome = (r.meeting_outcome || '').toLowerCase();

        return (
          title.includes(term) ||
          attendee.includes(term) ||
          email.includes(term) ||
          notes.includes(term) ||
          outcome.includes(term)
        );
      }

      return true;
    });
  }, [reminders, statusFilter, timeframe, searchTerm]);

  const formatOffsetHuman = (minutes: number, trigger: string) => {
    const isBefore = trigger === 'before_event';
    let timeStr = '';
    if (minutes >= 1440) {
      const days = Math.round(minutes / 1440);
      timeStr = `${days} day${days > 1 ? 's' : ''}`;
    } else if (minutes >= 60) {
      const hours = Math.round(minutes / 60);
      timeStr = `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      timeStr = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return isBefore ? `${timeStr} before meeting` : `${timeStr} after meeting`;
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wider">
            Urgent
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
            High
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
            Low
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200 uppercase tracking-wider">
            Medium
          </span>
        );
    }
  };

  const getRelativeDueText = (dateIso?: string, isDone?: boolean) => {
    if (!dateIso) return 'No due date set';
    const dt = parseISO(dateIso);
    if (isDone) return `Targeted ${format(dt, 'dd MMM yyyy')}`;
    if (isPast(dt)) {
      const days = differenceInDays(now, dt);
      if (days === 0) {
        const hours = differenceInHours(now, dt);
        return `Overdue by ${hours || 1} hour(s)`;
      }
      return `Overdue by ${days} day(s)`;
    }
    if (isToday(dt)) return `Due today at ${format(dt, 'hh:mm a')}`;
    const days = differenceInDays(dt, now);
    return `Due in ${days || 1} day(s) (${format(dt, 'dd MMM')})`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* ── Page Header ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Workflows & Meeting Reminders</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {activeWorkflowsCount} Active Automations
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automate pre-meeting reminders to eliminate no-shows and track post-meeting follow-ups.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {manualRunFeedback && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-in fade-in">
              {manualRunFeedback}
            </span>
          )}
          <button
            type="button"
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs transition-all disabled:opacity-50"
            title="Evaluate due reminders right now"
          >
            <Play className={`h-3.5 w-3.5 text-cyan-600 ${runNowMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{runNowMutation.isPending ? 'Evaluating...' : 'Run Reminders Now'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              refetchWorkflows();
              refetchReminders();
              refetchLogs();
            }}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh All"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Top-Level Tab Switcher ──────────────────────────────── */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('workflows')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'workflows'
              ? 'border-cyan-600 text-cyan-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>Automated Workflows</span>
          <span className="ml-1 px-2 py-0.2 rounded-full text-xs bg-slate-100 text-slate-600">
            {workflows.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('followups')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'followups'
              ? 'border-cyan-600 text-cyan-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ListTodo className="h-4 w-4" />
          <span>Follow-up Action Items</span>
          <span className="ml-1 px-2 py-0.2 rounded-full text-xs bg-cyan-50 text-cyan-700 border border-cyan-100">
            {metrics.pending}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'logs'
              ? 'border-cyan-600 text-cyan-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Delivery & Audit Logs</span>
          <span className="ml-1 px-2 py-0.2 rounded-full text-xs bg-slate-100 text-slate-600">
            {deliveryLogs.length}
          </span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB 1: AUTOMATED WORKFLOWS
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'workflows' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Active Meeting Reminders & Workflows
              </h2>
              <p className="text-xs text-slate-500">
                Pre-configured background triggers that dispatch emails at specific intervals before or after calls.
              </p>
            </div>
            <button
              onClick={() => setIsCreateWfOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Create Custom Workflow</span>
            </button>
          </div>

          {loadingWorkflows ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <Card className="p-8 text-center bg-white border border-slate-200">
              <Zap className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Workflows Configured</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Create a reminder workflow to automatically message attendees before scheduled meetings.
              </p>
              <button
                onClick={() => setIsCreateWfOpen(true)}
                className="mt-4 px-4 py-2 bg-cyan-600 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Create First Workflow
              </button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {workflows.map((wf: any) => {
                const isHost = wf.action_type === 'email_host';
                const isBoth = wf.action_type === 'email_both';
                return (
                  <Card
                    key={wf.id}
                    className={`p-5 border transition-all flex flex-col justify-between ${
                      wf.is_active
                        ? 'border-slate-200 bg-white hover:shadow-md'
                        : 'border-slate-200 bg-slate-50/60 opacity-60'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-2 rounded-xl text-white ${
                              wf.trigger_type === 'after_event'
                                ? 'bg-amber-500'
                                : isHost
                                ? 'bg-emerald-600'
                                : 'bg-cyan-600'
                            }`}
                          >
                            <Mail className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">{wf.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {formatOffsetHuman(wf.offset_minutes, wf.trigger_type)}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                                  isHost
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : isBoth
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                                }`}
                              >
                                {isHost ? 'Host Alert' : isBoth ? 'Host + Invitee' : 'Invitee Reminder'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Active Toggle Switch */}
                        <button
                          onClick={() =>
                            toggleWfMutation.mutate({ id: wf.id, is_active: !wf.is_active })
                          }
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                          title={wf.is_active ? 'Pause Workflow' : 'Activate Workflow'}
                        >
                          {wf.is_active ? (
                            <ToggleRight className="h-6 w-6 text-cyan-600" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-slate-300" />
                          )}
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 pt-1">
                        <span className="font-medium text-slate-700">Applies to: </span>
                        {wf.event_type_title ? (
                          <span className="font-semibold text-cyan-700">{wf.event_type_title}</span>
                        ) : (
                          <span>All Event Types</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setTestingWorkflow(wf);
                          setTestRecipientEmail('');
                          setTestFeedback(null);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 hover:text-cyan-900 px-2.5 py-1.5 rounded-lg hover:bg-cyan-50 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Send Test Email</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete workflow "${wf.name}"?`)) {
                            deleteWfMutation.mutate(wf.id);
                          }
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete Workflow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 2: FOLLOW-UP ACTION ITEMS
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'followups' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* KPI Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <Card className="p-4 bg-white/90 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Total Follow-ups</span>
                <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <ListTodo className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{metrics.total}</p>
            </Card>

            <Card className="p-4 bg-white/90 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-600">Pending Action</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{metrics.pending}</p>
            </Card>

            <Card className="p-4 bg-white/90 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-600">Overdue</span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-rose-600 mt-2">{metrics.overdue}</p>
            </Card>

            <Card className="p-4 bg-white/90 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600">Completed</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{metrics.completed}</p>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="p-4 bg-white border border-slate-200">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search meeting, attendee, or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-700 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="pending">Pending Follow-ups</option>
                  <option value="completed">Completed</option>
                  <option value="all">All Statuses</option>
                </select>

                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as TimeframeFilter)}
                  className="text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-700 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="all">All Time</option>
                  <option value="overdue">Overdue Only</option>
                  <option value="today">Due Today</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Follow-up Cards List */}
          {loadingReminders ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredReminders.length === 0 ? (
            <Card className="p-8 text-center bg-white border border-slate-200">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">All caught up!</h3>
              <p className="text-xs text-slate-500 mt-1">No meeting follow-up tasks match this view.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredReminders.map((r: any) => {
                const isDone = r.followup_status === 'completed';
                const attendee = r.invitees?.[0];
                return (
                  <Card
                    key={r.id}
                    className={`p-4 border transition-all ${
                      isDone
                        ? 'border-slate-200 bg-slate-50/70 opacity-60'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              id: r.id,
                              newStatus: isDone ? 'pending' : 'completed',
                            })
                          }
                          className="mt-0.5 text-slate-400 hover:text-cyan-600"
                        >
                          {isDone ? (
                            <CheckSquare className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <Square className="h-5 w-5 text-slate-300 hover:text-slate-400" />
                          )}
                        </button>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-bold ${
                                isDone ? 'line-through text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {r.title || 'Follow-up Task'}
                            </span>
                            {getPriorityBadge(r.followup_priority)}
                          </div>

                          {attendee && (
                            <div className="text-xs text-slate-500 flex items-center gap-1.5">
                              <User className="h-3 w-3" />
                              <span>{attendee.name}</span>
                              <span>({attendee.email})</span>
                            </div>
                          )}

                          {r.followup_notes && (
                            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200/60 rounded-lg p-2 mt-1">
                              {r.followup_notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-[11px] font-semibold text-slate-500">
                          {getRelativeDueText(r.followup_date, isDone)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingBooking(r)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                          title="Edit Outcome / Action Items"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 3: DELIVERY & AUDIT LOGS
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'logs' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Notification Delivery Logs
              </h2>
              <p className="text-xs text-slate-500">
                Audit trail of all automated reminder emails dispatched to attendees and hosts.
              </p>
            </div>
            <button
              onClick={() => refetchLogs()}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <Card className="overflow-hidden bg-white border border-slate-200">
            {loadingLogs ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading delivery history...</div>
            ) : deliveryLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No reminders dispatched yet. Trigger reminders above or schedule a meeting to test.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Dispatched Time</th>
                      <th className="px-4 py-3">Workflow Rule</th>
                      <th className="px-4 py-3">Meeting</th>
                      <th className="px-4 py-3">Channel</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {deliveryLogs.map((log: any) => {
                      const isSent = log.status === 'sent';
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                            {format(parseISO(log.created_at), 'dd MMM yyyy, hh:mm a')}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {log.workflow_name || 'Automated Reminder'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 truncate max-w-xs">
                            {log.booking_title || 'Meeting'}
                          </td>
                          <td className="px-4 py-3 capitalize">{log.channel}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                isSent
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {isSent ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                              <span>{log.status}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Modal: Create Custom Workflow ──────────────────────── */}
      {isCreateWfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-cyan-600" />
                <h2 className="text-base font-bold text-slate-900">Create Reminder Workflow</h2>
              </div>
              <button
                onClick={() => setIsCreateWfOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Workflow Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2 Hours Before Meeting (Attendee)"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Trigger Condition
                  </label>
                  <select
                    value={wfTriggerType}
                    onChange={(e) => setWfTriggerType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="before_event">Before Meeting</option>
                    <option value="after_event">After Meeting</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Recipient
                  </label>
                  <select
                    value={wfActionType}
                    onChange={(e) => setWfActionType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="email_attendee">Invitee (Attendee)</option>
                    <option value="email_host">Host (Employee)</option>
                    <option value="email_both">Both Host & Invitee</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Timing Offset
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={wfOffsetAmount}
                    onChange={(e) => setWfOffsetAmount(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                  <select
                    value={wfOffsetUnit}
                    onChange={(e) => setWfOffsetUnit(e.target.value as any)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Apply To
                </label>
                <select
                  value={wfEventTypeId}
                  onChange={(e) => setWfEventTypeId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="">All Event Types</option>
                  {eventTypes.map((et: any) => (
                    <option key={et.id} value={et.id}>
                      {et.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateWfOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createWfMutation.isPending}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {createWfMutation.isPending ? 'Creating...' : 'Create Workflow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Send Test Preview ──────────────────────────── */}
      {testingWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-cyan-600" />
                <h2 className="text-base font-bold text-slate-900">Send Test Preview</h2>
              </div>
              <button
                onClick={() => setTestingWorkflow(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Dispatch a sample test email for <strong>{testingWorkflow.name}</strong> to verify template formatting and copy.
            </p>

            {testFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  testFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {testFeedback.text}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                testWfMutation.mutate({ id: testingWorkflow.id, email: testRecipientEmail.trim() });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Recipient Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="your.email@example.com"
                  value={testRecipientEmail}
                  onChange={(e) => setTestRecipientEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTestingWorkflow(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={testWfMutation.isPending}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {testWfMutation.isPending ? 'Sending Test...' : 'Send Test Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Follow-up Modals ──────────────────────────────────── */}
      <MeetingOutcomeModal
        booking={editingBooking}
        isOpen={Boolean(editingBooking)}
        onClose={() => setEditingBooking(null)}
        onSuccess={() => refetchReminders()}
      />

      <MeetingDetailsModal
        booking={detailsBooking}
        isOpen={Boolean(detailsBooking)}
        onClose={() => setDetailsBooking(null)}
      />
    </div>
  );
};
