import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink, 
  ToggleLeft, 
  ToggleRight, 
  X, 
  ArrowRight,
  HelpCircle,
  Sparkles,
  Layers,
  Settings2,
  FileText
} from 'lucide-react';

interface FormField {
  id: string;
  label: string;
  type: 'select' | 'text' | 'radio';
  required: boolean;
  options?: string[];
}

interface RouteRule {
  id: string;
  name: string;
  conditions: {
    field_id: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  }[];
  action: 'event_type' | 'custom_url';
  target_slug?: string;
  target_owner_username?: string;
  target_url?: string;
}

export const RoutingFormsPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<any | null>(null);

  // Form builder state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>([
    {
      id: 'company_size',
      label: 'What is your team size?',
      type: 'select',
      required: true,
      options: ['1-10 employees', '11-50 employees', '50+ employees'],
    },
  ]);
  const [rules, setRules] = useState<RouteRule[]>([
    {
      id: 'rule_enterprise',
      name: 'Route 50+ employees to Enterprise Demo',
      conditions: [
        { field_id: 'company_size', operator: 'equals', value: '50+ employees' }
      ],
      action: 'event_type',
      target_slug: '30-minute-meeting',
    },
  ]);
  const [fallbackAction, setFallbackAction] = useState<'event_type' | 'custom_url'>('event_type');
  const [fallbackTarget, setFallbackTarget] = useState('30-minute-meeting');

  const { data: routingForms = [], isLoading } = useQuery({
    queryKey: ['routing-forms'],
    queryFn: async () => (await api.get('/routing-forms')).data,
  });

  const { data: eventTypes = [] } = useQuery({
    queryKey: ['event-types-for-routing'],
    queryFn: async () => (await api.get('/event-types')).data,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => (await api.post('/routing-forms', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-forms'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => (await api.patch(`/routing-forms/${id}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-forms'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/routing-forms/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-forms'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      (await api.patch(`/routing-forms/${id}`, { is_active })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-forms'] });
    },
  });

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setFields([
      {
        id: 'company_size',
        label: 'What is your team size?',
        type: 'select',
        required: true,
        options: ['1-10 employees', '11-50 employees', '50+ employees'],
      },
    ]);
    setRules([
      {
        id: 'rule_1',
        name: 'Enterprise routing',
        conditions: [
          { field_id: 'company_size', operator: 'equals', value: '50+ employees' }
        ],
        action: 'event_type',
        target_slug: eventTypes[0]?.slug || '30-minute-meeting',
      },
    ]);
    setFallbackAction('event_type');
    setFallbackTarget(eventTypes[0]?.slug || '30-minute-meeting');
    setEditingForm(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (form: any) => {
    setEditingForm(form);
    setName(form.name);
    setSlug(form.slug);
    setDescription(form.description || '');
    setFields(form.fields || []);
    setRules(form.rules || []);
    setFallbackAction(form.fallback_action || 'event_type');
    setFallbackTarget(form.fallback_target || '');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      description,
      fields,
      rules,
      fallback_action: fallbackAction,
      fallback_target: fallbackTarget,
      is_active: true,
    };

    if (editingForm) {
      updateMutation.mutate({ id: editingForm.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const copyFormLink = (formSlug: string, id: string) => {
    const url = `${window.location.origin}/forms/${formSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Field editing helpers
  const addField = () => {
    const newId = `field_${Date.now()}`;
    setFields((prev) => [
      ...prev,
      {
        id: newId,
        label: 'New Question',
        type: 'select',
        required: true,
        options: ['Option A', 'Option B'],
      },
    ]);
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  // Rule editing helpers
  const addRule = () => {
    const firstField = fields[0];
    setRules((prev) => [
      ...prev,
      {
        id: `rule_${Date.now()}`,
        name: `Rule ${prev.length + 1}`,
        conditions: [
          {
            field_id: firstField ? firstField.id : '',
            operator: 'equals',
            value: firstField?.options ? firstField.options[0] : '',
          },
        ],
        action: 'event_type',
        target_slug: eventTypes[0]?.slug || '',
      },
    ]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Lead Qualification & Routing Forms</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ask screening questions before booking to dynamically route visitors to the right meeting or host
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-cyan-500/20 transition-all shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Routing Form</span>
        </button>
      </div>

      {/* Forms Grid */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <div className="h-7 w-7 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : routingForms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-2xs">
          <div className="h-14 w-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto mb-4 border border-cyan-100">
            <GitBranch className="h-7 w-7" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">No Routing Forms Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Create a routing form to qualify leads by team size, region, or inquiry type, and send them directly to the appropriate calendar.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Create Your First Form</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {routingForms.map((form: any) => {
            const formUrl = `/forms/${form.slug}`;
            return (
              <div
                key={form.id}
                className={`bg-white border rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                  form.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{form.name}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">/forms/{form.slug}</p>
                    </div>

                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: form.id, is_active: !form.is_active })}
                      title={form.is_active ? 'Disable form' : 'Enable form'}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {form.is_active ? (
                        <ToggleRight className="h-6 w-6 text-cyan-600" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-slate-300" />
                      )}
                    </button>
                  </div>

                  {form.description && (
                    <p className="mt-3 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {form.description}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      <FileText className="h-3 w-3 text-slate-500" />
                      <span>{form.fields?.length || 0} Questions</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200/60 px-2 py-0.5 rounded-md">
                      <GitBranch className="h-3 w-3 text-cyan-600" />
                      <span>{form.rules?.length || 0} Routing Rules</span>
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyFormLink(form.slug, form.id)}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800 bg-cyan-50 hover:bg-cyan-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {copiedId === form.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Form Link</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpenEdit(form)}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Settings2 className="h-3.5 w-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-1">
                    <a
                      href={formUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Preview public form"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        if (confirm(`Delete routing form "${form.name}"?`)) {
                          deleteMutation.mutate(form.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete form"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div
            className="modal-sheet max-w-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingForm ? 'Edit Routing Form' : 'Create New Routing Form'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure qualification questions and dynamic routing logic
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body custom-scrollbar space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Basic Meta */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Form Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sales Inquiry & Demo Router"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!editingForm && (!slug || slug === name.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))) {
                          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
                        }
                      }}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Public Form Slug
                    </label>
                    <div className="flex rounded-xl shadow-2xs">
                      <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                        /forms/
                      </span>
                      <input
                        type="text"
                        required
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-r-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Description / Heading
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Tell visitors what this form is for..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Question Fields Section */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        1. Intake Questions
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Questions asked to visitors before routing them
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addField}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Question</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <div key={field.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            placeholder="Question label..."
                            value={field.label}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFields((prev) => prev.map((f, i) => i === idx ? { ...f, label: val } : f));
                            }}
                            className="flex-1 px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setFields((prev) => prev.map((f, i) => i === idx ? { ...f, type: val } : f));
                            }}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="select">Dropdown Menu</option>
                            <option value="radio">Radio Buttons</option>
                            <option value="text">Text Input</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeField(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Remove Question"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {['select', 'radio'].includes(field.type) && (
                          <div>
                            <label className="block text-[10px] text-slate-500 font-medium mb-1">
                              Choices (comma separated):
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. 1-10 employees, 11-50 employees, 50+ employees"
                              value={(field.options || []).join(', ')}
                              onChange={(e) => {
                                const opts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                setFields((prev) => prev.map((f, i) => i === idx ? { ...f, options: opts } : f));
                              }}
                              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Routing Rules Section */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
                        <span>2. Routing Rules (Evaluated in Order)</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        First matching rule determines where the invitee is sent
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addRule}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Rule</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {rules.map((rule, rIdx) => (
                      <div key={rule.id} className="p-3 bg-cyan-50/40 border border-cyan-200/70 rounded-xl space-y-2.5">
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            placeholder="Rule name..."
                            value={rule.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRules((prev) => prev.map((r, i) => i === rIdx ? { ...r, name: val } : r));
                            }}
                            className="font-semibold text-xs text-slate-900 bg-transparent border-b border-cyan-300 focus:outline-none pb-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => removeRule(rIdx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Remove Rule"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Condition */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-500">If</span>
                          <select
                            value={rule.conditions[0]?.field_id || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRules((prev) => prev.map((r, i) => i === rIdx ? {
                                ...r,
                                conditions: [{ ...r.conditions[0], field_id: val }]
                              } : r));
                            }}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            {fields.map((f) => (
                              <option key={f.id} value={f.id}>{f.label}</option>
                            ))}
                          </select>

                          <select
                            value={rule.conditions[0]?.operator || 'equals'}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setRules((prev) => prev.map((r, i) => i === rIdx ? {
                                ...r,
                                conditions: [{ ...r.conditions[0], operator: val }]
                              } : r));
                            }}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="equals">is equal to</option>
                            <option value="contains">contains</option>
                            <option value="not_equals">is not equal to</option>
                          </select>

                          <input
                            type="text"
                            placeholder="Value to match..."
                            value={rule.conditions[0]?.value || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRules((prev) => prev.map((r, i) => i === rIdx ? {
                                ...r,
                                conditions: [{ ...r.conditions[0], value: val }]
                              } : r));
                            }}
                            className="flex-1 min-w-[120px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        {/* Action */}
                        <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-cyan-100">
                          <span className="font-semibold text-cyan-700 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" />
                            <span>Route to</span>
                          </span>
                          <select
                            value={rule.action}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setRules((prev) => prev.map((r, i) => i === rIdx ? { ...r, action: val } : r));
                            }}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="event_type">Event Type</option>
                            <option value="custom_url">External URL</option>
                          </select>

                          {rule.action === 'event_type' ? (
                            <select
                              value={rule.target_slug || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRules((prev) => prev.map((r, i) => i === rIdx ? { ...r, target_slug: val } : r));
                              }}
                              className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                            >
                              <option value="">Select Event Type...</option>
                              {eventTypes.map((et: any) => (
                                <option key={et.id} value={et.slug}>
                                  {et.title} (/{user?.username}/{et.slug})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              placeholder="https://..."
                              value={rule.target_url || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRules((prev) => prev.map((r, i) => i === rIdx ? { ...r, target_url: val } : r));
                              }}
                              className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fallback Section */}
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    3. Fallback Route
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    If visitor answers do not match any of the rules above:
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={fallbackAction}
                      onChange={(e) => setFallbackAction(e.target.value as any)}
                      className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="event_type">Route to Event Type</option>
                      <option value="custom_url">Redirect to Custom URL</option>
                    </select>

                    {fallbackAction === 'event_type' ? (
                      <select
                        value={fallbackTarget}
                        onChange={(e) => setFallbackTarget(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                      >
                        {eventTypes.map((et: any) => (
                          <option key={et.id} value={et.slug}>
                            {et.title} (/{user?.username}/{et.slug})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="https://..."
                        value={fallbackTarget}
                        onChange={(e) => setFallbackTarget(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-cyan-500"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
                >
                  {editingForm ? 'Save Changes' : 'Create Routing Form'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
