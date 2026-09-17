import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { Card } from '../components/Card';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, ShieldCheck } from 'lucide-react';

export const GoogleOAuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage(
          error === 'access_denied'
            ? 'Access was cancelled or denied on the Google sign-in consent screen.'
            : `Google OAuth error: ${error}`
        );
        return;
      }

      if (!code) {
        setStatus('error');
        setErrorMessage('No authorization code was returned by Google.');
        return;
      }

      try {
        const res = await api.post('/auth/google/callback', {
          code,
          state,
          redirect_uri: window.location.origin + '/auth/google/callback',
        });

        if (res.data) {
          setUser(res.data);
          setConnectedEmail(res.data.google_email || 'Google Account');
          setStatus('success');
          setTimeout(() => {
            navigate('/profile');
          }, 2500);
        }
      } catch (err: any) {
        console.error('Google OAuth callback failed:', err);
        setStatus('error');
        setErrorMessage(
          err.response?.data?.detail || 'Failed to exchange authorization code with Google services.'
        );
      }
    };

    processCallback();
  }, [searchParams, setUser, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center bg-white border border-slate-200/90 shadow-xl rounded-2xl">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="h-9 w-9" />
          </div>
        </div>

        {status === 'loading' && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <RefreshCw className="h-8 w-8 text-cyan-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Connecting Google Account</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Exchanging secure authorization tokens with Google services and enabling Google Meet conferencing...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Successfully Connected!</h2>
            <p className="text-xs text-slate-600">
              Your Google account <strong className="text-slate-900 font-semibold">{connectedEmail}</strong> is now
              linked to Kavach Connect.
            </p>
            <div className="p-3 bg-cyan-50/80 border border-cyan-200 rounded-xl text-xs text-cyan-800 font-medium">
              Google Meet is now activated for your internal meetings & event types.
            </div>
            <p className="text-[11px] text-slate-400">Redirecting to your profile...</p>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="mt-2 w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
            >
              Return to Profile Now
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertCircle className="h-7 w-7" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Connection Failed</h2>
            <p className="text-xs text-rose-600 font-medium bg-rose-50 p-3 rounded-xl border border-rose-200 text-left">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="mt-2 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Profile</span>
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
