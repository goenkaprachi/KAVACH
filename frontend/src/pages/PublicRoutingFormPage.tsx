import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { 
  GitBranch, 
  ArrowRight, 
  User, 
  Mail, 
  Sparkles, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const PublicRoutingFormPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: form, isLoading, isError } = useQuery({
    queryKey: ['public-routing-form', slug],
    queryFn: async () => (await api.get(`/routing-forms/public/${slug}`)).data,
    enabled: !!slug,
  });

  const evaluateMutation = useMutation({
    mutationFn: async (payload: any) => (await api.post(`/routing-forms/public/${slug}/evaluate`, payload)).data,
    onSuccess: (data: any) => {
      const target = data.target_url;
      if (target.startsWith('http://') || target.startsWith('https://')) {
        window.location.href = target;
      } else {
        navigate(target);
      }
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || 'Failed to route. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validate required questions
    for (const f of form?.fields || []) {
      if (f.required && !answers[f.id] && !answers[f.label]) {
        setErrorMsg(`Please answer "${f.label}" before continuing.`);
        return;
      }
    }

    evaluateMutation.mutate({
      invitee_name: inviteeName.trim() || undefined,
      invitee_email: inviteeEmail.trim() || undefined,
      answers,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !form) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Form Not Found</h2>
          <p className="mt-1 text-xs text-slate-500">
            This routing form link may have been disabled or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center space-x-2.5 pb-2">
            <img
              src="/badge.jpg"
              alt="Kavach Connect"
              className="h-8 w-8 rounded-full object-cover shadow-sm border border-amber-900/20"
            />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kavach Connect</span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-2">
            {form.name}
          </h1>

          {form.description ? (
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              {form.description}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Please answer a few quick questions so we can match you with the right team member.
            </p>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={inviteeName}
                  onChange={(e) => setInviteeName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Work Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  placeholder="e.g. john@acme.com"
                  value={inviteeEmail}
                  onChange={(e) => setInviteeEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Qualification Questions */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            {form.fields.map((f: any) => (
              <div key={f.id} className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>

                {f.type === 'select' && (
                  <select
                    required={f.required}
                    value={answers[f.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  >
                    <option value="">Select an option...</option>
                    {(f.options || []).map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {f.type === 'radio' && (
                  <div className="space-y-2 pt-1">
                    {(f.options || []).map((opt: string) => (
                      <label key={opt} className="flex items-center space-x-2.5 cursor-pointer text-xs text-slate-700">
                        <input
                          type="radio"
                          name={f.id}
                          value={opt}
                          checked={answers[f.id] === opt}
                          onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                          className="text-cyan-600 focus:ring-cyan-500 h-4 w-4"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {f.type === 'text' && (
                  <input
                    type="text"
                    required={f.required}
                    placeholder="Enter your response..."
                    value={answers[f.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={evaluateMutation.isPending}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-sm font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {evaluateMutation.isPending ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Finding the best match...</span>
              </>
            ) : (
              <>
                <span>Continue to Calendar</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
