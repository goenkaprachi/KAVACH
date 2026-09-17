import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Mail,
  Edit,
  RotateCcw,
  Send,
  Check,
  AlertCircle,
  Eye,
  Code,
  X,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';

interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
}

const TEMPLATE_VARIABLES = [
  { tag: '{attendee_name}', desc: "Attendee's full name" },
  { tag: '{attendee_email}', desc: "Attendee's email address" },
  { tag: '{host_name}', desc: 'Host employee name' },
  { tag: '{host_email}', desc: 'Host employee email' },
  { tag: '{event_title}', desc: 'Meeting title or event type' },
  { tag: '{start_time}', desc: 'Formatted start date and time' },
  { tag: '{end_time}', desc: 'Formatted end date and time' },
  { tag: '{old_start_time}', desc: 'Previous start time (reschedules)' },
  { tag: '{new_start_time}', desc: 'New start time (reschedules)' },
  { tag: '{meeting_url}', desc: 'Direct video/meeting join link' },
  { tag: '{time_until}', desc: 'Relative reminder timeframe (e.g., in 24 hours, in 1 hour)' },
  { tag: '{reason}', desc: 'Reschedule or cancellation rationale' },
  { tag: '{cancellation_token}', desc: 'Unique reference cancellation code' },
];

export const AdminEmailTemplatesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [editorTab, setEditorTab] = useState<'code' | 'preview'>('code');

  const [testingTemplate, setTestingTemplate] = useState<NotificationTemplate | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<NotificationTemplate[]>({
    queryKey: ['admin-notification-templates'],
    queryFn: async () => {
      const res = await api.get('/admin/notification-templates');
      return res.data;
    },
  });

  // Save template mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.patch(`/admin/notification-templates/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notification-templates'] });
      setEditingTemplate(null);
      setFeedbackMessage({ type: 'success', text: 'Email template saved successfully.' });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
    onError: (err: any) => {
      setFeedbackMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update template.' });
    },
  });

  // Reset template mutation
  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/notification-templates/${id}/reset`);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-notification-templates'] });
      if (editingTemplate && editingTemplate.id === updated.id) {
        setSubject(updated.subject);
        setBody(updated.body);
      }
      setFeedbackMessage({ type: 'success', text: 'Template reset to system default.' });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
    onError: (err: any) => {
      setFeedbackMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to reset template.' });
    },
  });

  // Test email mutation
  const testMutation = useMutation({
    mutationFn: async ({ id, recipient }: { id: string; recipient: string }) => {
      const res = await api.post(`/admin/notification-templates/${id}/test`, {
        recipient_email: recipient,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      setTestSuccess(data.message || 'Test email dispatched.');
      setTestError(null);
      setTimeout(() => {
        setTestingTemplate(null);
        setTestSuccess(null);
      }, 2500);
    },
    onError: (err: any) => {
      setTestError(err.response?.data?.detail || 'Failed to send test email.');
    },
  });

  const handleOpenEdit = (tmpl: NotificationTemplate) => {
    setEditingTemplate(tmpl);
    setSubject(tmpl.subject);
    setBody(tmpl.body);
    setEditorTab('code');
  };

  const handleInsertTag = (tag: string) => {
    setBody((prev) => prev + tag);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    updateMutation.mutate({
      id: editingTemplate.id,
      payload: {
        subject: subject.trim(),
        body: body.trim(),
      },
    });
  };

  const handleSendTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testingTemplate || !testEmail.trim()) return;
    testMutation.mutate({
      id: testingTemplate.id,
      recipient: testEmail.trim(),
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Orion Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Email Notification Templates</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                {templates.length} Active Templates
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Customize subject lines and HTML email templates sent across all meeting lifecycle triggers
            </p>
          </div>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-150 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Templates Table Card */}
      <Card className="p-0 overflow-hidden bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4">Notification Event</th>
                <th className="px-6 py-4">Trigger Key</th>
                <th className="px-6 py-4">Subject Line</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-xs text-slate-400">
                    Loading templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-xs text-slate-400">
                    No templates found.
                  </td>
                </tr>
              ) : (
                templates.map((tmpl, idx) => (
                  <tr
                    key={tmpl.id}
                    className={`hover:bg-slate-50/75 transition-colors ${idx % 2 !== 0 ? 'bg-slate-50/20' : ''}`}
                  >
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0 border border-cyan-100 font-bold text-xs">
                          <Mail className="h-4 w-4" />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">{tmpl.name}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 align-middle whitespace-nowrap">
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {tmpl.type}
                      </span>
                    </td>

                    <td className="px-6 py-4 align-middle text-xs font-medium text-slate-700 truncate max-w-xs">
                      {tmpl.subject}
                    </td>

                    <td className="px-6 py-4 align-middle text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTestingTemplate(tmpl);
                            setTestSuccess(null);
                            setTestError(null);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          title="Send test email"
                        >
                          <Send className="h-3.5 w-3.5 text-slate-500" />
                          <span>Test</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tmpl)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 transition-colors"
                        >
                          <Edit className="h-3.5 w-3.5 text-cyan-600" />
                          <span>Customize</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Template Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
                  <Edit className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Customize Email Template</h2>
                  <p className="text-xs text-slate-500">{editingTemplate.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium text-slate-900"
                />
              </div>

              {/* Variable Chips */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Available Template Tags (Click to Append)
                </label>
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  {TEMPLATE_VARIABLES.map(({ tag, desc }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleInsertTag(tag)}
                      title={desc}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-cyan-50 text-cyan-800 border border-slate-200 text-[11px] font-mono transition-colors shadow-2xs cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor Tabs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setEditorTab('code')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        editorTab === 'code' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Code className="h-3.5 w-3.5" />
                      <span>HTML Source</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab('preview')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        editorTab === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Live Preview</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => resetMutation.mutate(editingTemplate.id)}
                    disabled={resetMutation.isPending}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-bold px-2 py-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset to Default</span>
                  </button>
                </div>

                {editorTab === 'code' ? (
                  <textarea
                    rows={12}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none leading-relaxed"
                  />
                ) : (
                  <div className="p-4 border border-slate-200 rounded-2xl bg-white min-h-[260px] max-h-[380px] overflow-y-auto">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: body
                          .replace(/\{attendee_name\}/g, 'Alex Johnson')
                          .replace(/\{host_name\}/g, 'Sarah Connor')
                          .replace(/\{event_title\}/g, 'Architecture Sprint Planning')
                          .replace(/\{start_time\}/g, 'Thursday, Oct 15, 2026 at 10:00 AM UTC')
                          .replace(/\{meeting_url\}/g, 'https://meet.google.com/abc-defg-hij')
                          .replace(/\{reason\}/g, 'Schedule adjustment')
                          .replace(/\{cancellation_token\}/g, 'KV-DEMO-REF'),
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>{updateMutation.isPending ? 'Saving...' : 'Save Template'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Test Email Modal */}
      {testingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Send Test Email</h2>
                  <p className="text-xs text-slate-500">{testingTemplate.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestingTemplate(null)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendTest} className="p-6 space-y-4">
              {testSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{testSuccess}</span>
                </div>
              )}
              {testError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{testError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Recipient Email Address
                </label>
                <input
                  type="email"
                  required
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTestingTemplate(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  <span>{testMutation.isPending ? 'Sending...' : 'Send Test'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
