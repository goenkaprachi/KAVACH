import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Video, ShieldCheck, CheckCircle2, Settings2, Key, X, AlertTriangle } from 'lucide-react';

export const AdminIntegrations: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accountId, setAccountId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: async () => {
      const res = await api.get('/admin/integrations');
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ provider, payload }: { provider: string; payload: any }) => {
      return await api.put(`/admin/integrations/${provider}`, payload);
    },
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['available-integrations'] });
      setSelectedProvider(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Failed to save integration configuration.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (provider: string) => {
      return await api.patch(`/admin/integrations/${provider}/toggle`);
    },
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['available-integrations'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Failed to toggle integration.');
    },
  });

  const handleOpenConfig = (item: any) => {
    setSelectedProvider(item);
    setApiKey('');
    setClientId('');
    setClientSecret('');
    setAccountId('');
    setErrorMessage(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    let creds: any = {};
    if (selectedProvider.provider === 'whereby') {
      if (!apiKey.trim()) {
        setErrorMessage('Whereby API Key is required to enable this integration.');
        return;
      }
      creds = { api_key: apiKey.trim() };
    } else if (selectedProvider.provider === 'google_meet') {
      if (!clientId.trim() || !clientSecret.trim()) {
        setErrorMessage('Google Meet Client ID and Client Secret are required.');
        return;
      }
      creds = {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      };
    } else if (selectedProvider.provider === 'zoom') {
      if (!accountId.trim() || !clientId.trim() || !clientSecret.trim()) {
        setErrorMessage('Zoom Account ID, Client ID, and Client Secret are all required.');
        return;
      }
      creds = {
        account_id: accountId.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      };
    } else if (selectedProvider.provider === 'microsoft_teams') {
      if (!accountId.trim() || !clientId.trim() || !clientSecret.trim()) {
        setErrorMessage('Microsoft Teams Tenant ID, Client ID, and Client Secret are all required.');
        return;
      }
      creds = {
        tenant_id: accountId.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      };
    }

    saveMutation.mutate({
      provider: selectedProvider.provider,
      payload: {
        is_enabled: true,
        credentials: creds,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Meeting Provider Hub</h1>
        <p className="text-sm text-slate-500">
          Centrally configure video conferencing integrations across your organization
        </p>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start space-x-3 text-xs text-blue-800 leading-relaxed">
        <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Zero-Setup Determinism Guaranteed:</span>{' '}
          Kavach Connect automatically uses Jitsi Meet as the safety net default. If any third-party provider credentials fail or expire at booking time, the engine automatically generates a secure Jitsi link so no booking is ever left without a join link.
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-3 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-40 bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {integrations.map((item: any) => {
            const isJitsi = item.provider === 'jitsi';
            return (
              <div
                key={item.provider}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                        <Video className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{item.display_name}</h3>
                        <span className="text-[11px] text-slate-500 capitalize">{item.auth_type} auth</span>
                      </div>
                    </div>

                    {isJitsi ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Active Default
                      </span>
                    ) : !item.is_configured ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                        Not Configured
                      </span>
                    ) : item.is_enabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                        Disabled
                      </span>
                    )}
                  </div>

                  <p className="mt-4 text-xs text-slate-600">
                    {item.notes || `Configure org-wide ${item.display_name} credentials for employee bookings.`}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {item.is_configured ? 'Configured' : 'Not configured'}
                  </span>
                  {!isJitsi && (
                    <div className="flex items-center space-x-2">
                      {item.is_configured ? (
                        <>
                          <button
                            onClick={() => toggleMutation.mutate(item.provider)}
                            disabled={toggleMutation.isPending}
                            className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                              item.is_enabled
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {item.is_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleOpenConfig(item)}
                            className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-2.5 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            <span>Configure</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenConfig(item)}
                          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          <span>Configure</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Config Modal */}
      {selectedProvider && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Configure {selectedProvider.display_name}
              </h3>
              <button
                onClick={() => setSelectedProvider(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {selectedProvider.provider === 'whereby' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Whereby API Key
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="eyJhbGciOi..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <>
                  {selectedProvider.provider !== 'google_meet' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        {selectedProvider.provider === 'microsoft_teams' ? 'Tenant ID' : 'Account ID'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={
                          selectedProvider.provider === 'microsoft_teams'
                            ? 'Azure AD Tenant ID'
                            : 'Zoom Account ID'
                        }
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="OAuth Client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="OAuth Client Secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedProvider(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save & Enable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
