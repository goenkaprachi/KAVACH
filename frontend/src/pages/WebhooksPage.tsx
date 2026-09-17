import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  Send,
  Check,
  Copy,
  Eye,
  EyeOff,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Code2,
  ChevronRight,
  ExternalLink,
  X,
  AlertCircle,
} from 'lucide-react';

interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

interface WebhookLogItem {
  id: string;
  event: string;
  payload: any;
  response_status_code: number | null;
  response_body: string | null;
  status: string;
  delivered_at: string;
}

const AVAILABLE_EVENTS = [
  { id: 'booking.created', label: 'Booking Created', desc: 'Fires immediately when an invitee books a slot' },
  { id: 'booking.cancelled', label: 'Booking Cancelled', desc: 'Fires when host or invitee cancels a meeting' },
  { id: 'booking.rescheduled', label: 'Booking Rescheduled', desc: 'Fires when a meeting is moved to a new slot' },
  { id: 'booking.completed', label: 'Meeting Completed', desc: 'Fires when meeting is marked attended/completed' },
  { id: 'booking.no_show', label: 'Attendee No-Show', desc: 'Fires when an invitee fails to attend the meeting' },
];

export const WebhooksPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['booking.created', 'booking.cancelled']);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  // Test Ping Modal State
  const [testResult, setTestResult] = useState<{ id: string; data: any } | null>(null);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  // Delivery Logs Modal State
  const [selectedWebhookForLogs, setSelectedWebhookForLogs] = useState<WebhookItem | null>(null);
  const [selectedLogPayload, setSelectedLogPayload] = useState<WebhookLogItem | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<WebhookItem[]>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const res = await api.get('/webhooks');
      return res.data;
    },
  });

  const { data: webhookLogs = [], isLoading: isLoadingLogs } = useQuery<WebhookLogItem[]>({
    queryKey: ['webhook-logs', selectedWebhookForLogs?.id],
    queryFn: async () => {
      if (!selectedWebhookForLogs) return [];
      const res = await api.get(`/webhooks/${selectedWebhookForLogs.id}/logs`);
      return res.data;
    },
    enabled: !!selectedWebhookForLogs,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { url: string; events: string[] }) => {
      const res = await api.post('/webhooks', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setIsCreateModalOpen(false);
      setNewUrl('');
      setSelectedEvents(['booking.created', 'booking.cancelled']);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await api.patch(`/webhooks/${id}`, { is_active });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      if (selectedWebhookForLogs) setSelectedWebhookForLogs(null);
    },
  });

  const testPingMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      setTestingWebhookId(webhookId);
      const res = await api.post(`/webhooks/${webhookId}/test`);
      return { id: webhookId, data: res.data };
    },
    onSuccess: (result) => {
      setTestingWebhookId(null);
      setTestResult(result);
      queryClient.invalidateQueries({ queryKey: ['webhook-logs', result.id] });
    },
    onError: () => {
      setTestingWebhookId(null);
    },
  });

  const handleCopySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecretId(id);
    setTimeout(() => setCopiedSecretId(null), 2000);
  };

  const toggleSecretReveal = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    createMutation.mutate({
      url: newUrl.trim(),
      events: selectedEvents,
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-sky-500 rounded-xl shadow-md shadow-cyan-500/20 text-white">
              <WebhookIcon className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Webhooks & Developer API</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Stream real-time scheduling events into your CRM, Slack, Zapier, or custom backends with cryptographic HMAC SHA-256 signing.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add Webhook Endpoint</span>
        </button>
      </div>

      {/* Developer Docs Quick Tip */}
      <div className="p-4 bg-slate-900 rounded-2xl text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-400/20 rounded-xl text-cyan-400 mt-0.5">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Signature Verification (HMAC SHA-256)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
              Every webhook delivery includes header <code className="text-cyan-300 font-mono">X-Kavach-Signature: sha256=&lt;hash&gt;</code> computed against the raw JSON payload using your webhook secret.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-[11px] font-mono bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-slate-300">
          <Code2 className="h-3.5 w-3.5 text-cyan-400" />
          <span>Header: X-Kavach-Event</span>
        </div>
      </div>

      {/* Webhooks List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
          <div className="w-12 h-12 mx-auto bg-cyan-50 border border-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center">
            <WebhookIcon className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">No Webhook Endpoints Configured</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add your first endpoint to start receiving real-time booking creations, cancellations, and reschedules.
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20"
          >
            <Plus className="h-4 w-4" />
            <span>Create Webhook</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {webhooks.map((wh) => {
            const isRevealed = revealedSecrets[wh.id];
            const isTesting = testingWebhookId === wh.id;

            return (
              <div
                key={wh.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs transition-all space-y-4 ${
                  wh.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50/60 opacity-75'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        POST
                      </span>
                      <span className="text-sm font-bold text-slate-900 break-all font-mono">
                        {wh.url}
                      </span>
                    </div>

                    {/* Subscribed Events */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {wh.events.map((evt) => (
                        <span
                          key={evt}
                          className="inline-flex items-center text-[10px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200/60 px-2 py-0.5 rounded-md"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <button
                      onClick={() => testPingMutation.mutate(wh.id)}
                      disabled={isTesting}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-cyan-50 hover:text-cyan-700 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                      title="Send sample ping payload"
                    >
                      <Send className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Sending...' : 'Test Ping'}</span>
                    </button>

                    <button
                      onClick={() => setSelectedWebhookForLogs(wh)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
                      title="View delivery logs"
                    >
                      <Activity className="h-3.5 w-3.5 text-slate-500" />
                      <span>Logs</span>
                    </button>

                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: wh.id, is_active: !wh.is_active })}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        wh.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {wh.is_active ? 'Active' : 'Paused'}
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('Delete this webhook subscription?')) {
                          deleteMutation.mutate(wh.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      title="Delete Webhook"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Secret Key Bar */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center space-x-2 overflow-hidden">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
                      Signing Secret:
                    </span>
                    <span className="font-mono text-slate-700 truncate">
                      {isRevealed ? wh.secret : '••••••••••••••••••••••••••••••••••••••••'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => toggleSecretReveal(wh.id)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50"
                      title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                    >
                      {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => handleCopySecret(wh.id, wh.secret)}
                      className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-cyan-700 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                    >
                      {copiedSecretId === wh.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Webhook Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div
            className="modal-sheet max-w-lg animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="flex items-center space-x-2">
                <WebhookIcon className="h-5 w-5 text-cyan-600" />
                <h2 className="text-lg font-black text-slate-900">Add Webhook Endpoint</h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="modal-body space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Destination URL *
                </label>
                <input
                  type="url"
                  required
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Must start with <code className="text-slate-600">https://</code> or <code className="text-slate-600">http://</code>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Subscribed Events
                </label>
                <div className="space-y-2">
                  {AVAILABLE_EVENTS.map((evt) => {
                    const isSelected = selectedEvents.includes(evt.id);
                    return (
                      <label
                        key={evt.id}
                        className={`flex items-start space-x-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected ? 'bg-cyan-50/60 border-cyan-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvents([...selectedEvents, evt.id]);
                            } else {
                              setSelectedEvents(selectedEvents.filter((id) => id !== evt.id));
                            }
                          }}
                          className="mt-0.5 h-3.5 w-3.5 text-cyan-600 rounded border-slate-300 focus:ring-cyan-500"
                        />
                        <div>
                          <div className="font-bold text-slate-800">{evt.label}</div>
                          <div className="text-[11px] text-slate-500 leading-tight">{evt.desc}</div>
                          <code className="text-[10px] text-cyan-700 bg-cyan-100/50 px-1 py-0.5 rounded font-mono mt-1 inline-block">
                            {evt.id}
                          </code>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newUrl || selectedEvents.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Adding...' : 'Create Endpoint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Ping Feedback Modal */}
      {testResult && (
        <div className="modal-overlay" onClick={() => setTestResult(null)}>
          <div
            className="modal-sheet max-w-lg animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="flex items-center space-x-2">
                {testResult.data.status === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <h3 className="text-base font-bold text-slate-900">
                  {testResult.data.status === 'success' ? 'Ping Successful' : 'Ping Failed'}
                </h3>
              </div>
              <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="modal-body space-y-3">
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  testResult.data.status === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <span>HTTP Response Code:</span>
                <span className="font-mono font-bold text-sm">
                  {testResult.data.status_code || 'Network Error'}
                </span>
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Receiver Response Body
                </span>
                <pre className="p-3 bg-slate-900 text-cyan-300 font-mono text-xs rounded-xl overflow-x-auto max-h-48">
                  {testResult.data.response_body || '(Empty response body)'}
                </pre>
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setTestResult(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Logs Modal */}
      {selectedWebhookForLogs && (
        <div className="modal-overlay" onClick={() => setSelectedWebhookForLogs(null)}>
          <div
            className="modal-sheet max-w-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-cyan-600" />
                  <h3 className="text-base font-bold text-slate-900">Webhook Delivery Logs</h3>
                </div>
                <p className="text-xs text-slate-500 font-mono truncate max-w-md mt-0.5">
                  {selectedWebhookForLogs.url}
                </p>
              </div>
              <button onClick={() => setSelectedWebhookForLogs(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="modal-body space-y-3 max-h-[60vh] overflow-y-auto">
              {isLoadingLogs ? (
                <div className="p-8 text-center text-slate-400 text-xs">Loading delivery logs...</div>
              ) : webhookLogs.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                  No deliveries recorded yet. Use "Test Ping" or wait for booking activity.
                </div>
              ) : (
                <div className="space-y-2">
                  {webhookLogs.map((log) => {
                    const isSuccess = log.status === 'success';
                    return (
                      <div
                        key={log.id}
                        className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                                isSuccess
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {log.response_status_code ? `HTTP ${log.response_status_code}` : 'FAILED'}
                            </span>
                            <span className="font-bold text-slate-800 font-mono">{log.event}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(log.delivered_at).toLocaleString()}
                          </span>
                        </div>

                        {/* Expand payload toggle */}
                        <div className="pt-1">
                          <details className="text-[11px] text-slate-600">
                            <summary className="cursor-pointer font-semibold text-cyan-600 hover:text-cyan-700">
                              View Payload & Response
                            </summary>
                            <div className="mt-2 space-y-1.5">
                              <div>
                                <span className="text-[10px] font-bold uppercase text-slate-400">Sent Payload:</span>
                                <pre className="p-2 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto text-[10px] font-mono mt-0.5">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </div>
                              {log.response_body && (
                                <div>
                                  <span className="text-[10px] font-bold uppercase text-slate-400">Receiver Response:</span>
                                  <pre className="p-2 bg-slate-100 text-slate-700 rounded-lg overflow-x-auto text-[10px] font-mono mt-0.5">
                                    {log.response_body}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setSelectedWebhookForLogs(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
