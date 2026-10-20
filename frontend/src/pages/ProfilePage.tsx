import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Building,
  MapPin,
  BadgeAlert,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Video,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Save,
  KeyRound,
  Unlink,
  X,
} from 'lucide-react';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const ProfilePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: authUser, setUser: setAuthUser } = useAuthStore();

  // Profile Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Zoho Account state
  const [zohoEmailInput, setZohoEmailInput] = useState('');
  const [zohoMeetUrl, setZohoMeetUrl] = useState('');
  const [zohoSuccess, setZohoSuccess] = useState<string | null>(null);
  const [zohoError, setZohoError] = useState<string | null>(null);
  const [initiatingOAuth, setInitiatingOAuth] = useState(false);

  const { data: oauthConfig } = useQuery({
    queryKey: ['zoho-oauth-config'],
    queryFn: async () => {
      try {
        const res = await api.get('/auth/zoho/authorize-url');
        return res.data;
      } catch {
        return { configured: false };
      }
    },
  });

  // Fetch full user profile
  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setPhone(profile.phone || '');
      setJobTitle(profile.job_title || '');
      setDepartment(profile.department || '');
      setOfficeLocation(profile.office_location || '');
      setEmployeeCode(profile.employee_code || '');
      setBio(profile.bio || '');
      setTimezone(profile.timezone || 'Asia/Kolkata');
      setAvatarUrl(profile.avatar_url || '');
      setZohoEmailInput(profile.zoho_email || profile.email || '');
      setZohoMeetUrl(profile.zoho_meet_url || '');
    }
  }, [profile]);

  // Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.patch('/auth/me', payload);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['user-me'], updated);
      if (authUser) {
        setAuthUser({
          ...authUser,
          name: updated.name,
          timezone: updated.timezone,
          avatar_url: updated.avatar_url,
        });
      }
      setProfileSuccess('Profile details updated successfully.');
      setProfileError(null);
      setTimeout(() => setProfileSuccess(null), 4000);
    },
    onError: (err: any) => {
      setProfileError(err.response?.data?.detail || 'Failed to update profile.');
      setProfileSuccess(null);
    },
  });

  // Change Password Mutation
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/me/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      return res.data;
    },
    onSuccess: () => {
      setPasswordSuccess('Password changed successfully.');
      setPasswordError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 4000);
    },
    onError: (err: any) => {
      setPasswordError(err.response?.data?.detail || 'Failed to change password. Please check your current password.');
      setPasswordSuccess(null);
    },
  });

  // Zoho Connect Mutation
  const connectZohoMutation = useMutation({
    mutationFn: async (payload: { zoho_email: string; zoho_meet_url?: string | null }) => {
      const res = await api.post('/auth/me/zoho/connect', payload);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['user-me'], updated);
      if (authUser) {
        setAuthUser({
          ...authUser,
          zoho_email: updated.zoho_email,
          zoho_meet_url: updated.zoho_meet_url,
          has_zoho_token: updated.has_zoho_token,
          zoho_calendar_id: updated.zoho_calendar_id,
        });
      }
      setZohoSuccess('Zoho account connected. You can now select Zoho Meeting and sync Zoho Calendar.');
      setZohoError(null);
      setTimeout(() => setZohoSuccess(null), 4000);
    },
    onError: (err: any) => {
      setZohoError(err.response?.data?.detail || 'Failed to connect Zoho account.');
      setZohoSuccess(null);
    },
  });

  // Save Personal Zoho Meet URL Mutation
  const saveMeetUrlMutation = useMutation({
    mutationFn: async (meetUrl: string) => {
      const res = await api.patch('/auth/me', {
        zoho_meet_url: meetUrl.trim() || null,
      });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['user-me'], updated);
      if (authUser) {
        setAuthUser({
          ...authUser,
          zoho_meet_url: updated.zoho_meet_url,
        });
      }
      setZohoSuccess('Personal Zoho Meeting link saved successfully.');
      setZohoError(null);
      setTimeout(() => setZohoSuccess(null), 4000);
    },
    onError: (err: any) => {
      setZohoError(err.response?.data?.detail || 'Failed to save Zoho Meeting link.');
      setZohoSuccess(null);
    },
  });

  // Zoho Disconnect Mutation
  const disconnectZohoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/auth/me/zoho/disconnect');
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['user-me'], updated);
      if (authUser) {
        setAuthUser({
          ...authUser,
          zoho_email: undefined,
          zoho_meet_url: undefined,
          has_zoho_token: false,
          zoho_calendar_id: undefined,
        });
      }
      setZohoSuccess('Zoho account disconnected.');
      setZohoError(null);
      setTimeout(() => setZohoSuccess(null), 4000);
    },
    onError: (err: any) => {
      setZohoError(err.response?.data?.detail || 'Failed to disconnect Zoho account.');
      setZohoSuccess(null);
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      name: name.trim(),
      phone: phone.trim() || null,
      job_title: jobTitle.trim() || null,
      department: department.trim() || null,
      office_location: officeLocation.trim() || null,
      employee_code: employeeCode.trim() || null,
      bio: bio.trim() || null,
      timezone,
      avatar_url: avatarUrl.trim() || null,
      zoho_meet_url: zohoMeetUrl.trim() || null,
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    changePasswordMutation.mutate();
  };

  const handleStartZohoOAuth = async () => {
    setInitiatingOAuth(true);
    setZohoError(null);
    try {
      const res = await api.get('/auth/zoho/authorize-url');
      if (res.data.configured && res.data.auth_url) {
        window.location.href = res.data.auth_url;
      } else {
        const emailToConnect = zohoEmailInput.trim() || profile?.zoho_email || profile?.email;
        if (emailToConnect) {
          connectZohoMutation.mutate({
            zoho_email: emailToConnect,
            zoho_meet_url: zohoMeetUrl.trim() || null,
          });
        } else {
          setZohoError('Please enter your Zoho account email address.');
        }
      }
    } catch (err: any) {
      const emailToConnect = zohoEmailInput.trim() || profile?.zoho_email || profile?.email;
      if (emailToConnect) {
        connectZohoMutation.mutate({
          zoho_email: emailToConnect,
          zoho_meet_url: zohoMeetUrl.trim() || null,
        });
      } else {
        setZohoError(err.response?.data?.detail || 'Failed to connect Zoho account.');
      }
    } finally {
      setInitiatingOAuth(false);
    }
  };

  const handleConnectZoho = (e: React.FormEvent) => {
    e.preventDefault();
    const emailToConnect = zohoEmailInput.trim() || profile?.email;
    if (!emailToConnect) {
      setZohoError('Please provide a valid Zoho account email address.');
      return;
    }
    connectZohoMutation.mutate({
      zoho_email: emailToConnect,
      zoho_meet_url: zohoMeetUrl.trim() || null,
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4 max-w-4xl mx-auto">
        <div className="h-8 bg-slate-100 rounded-xl w-64 animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const isZohoConnected = Boolean(profile?.zoho_email);

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Orion Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Employee Profile</h1>
              <StatusBadge status={profile?.status || 'active'} dot />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Personal contact details, department attributes, password credentials, and Zoho account sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
            Role: <span className="font-bold text-slate-900 capitalize">{profile?.role}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 Cols): Personal & Employee Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title={
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-cyan-600" />
                <span>Employee & Organization Details</span>
              </div>
            }
            subtitle="Core employee attributes recorded in the organization directory"
          >
            {profileSuccess && (
              <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{profileSuccess}</span>
              </div>
            )}
            {profileError && (
              <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium"
                      placeholder="e.g. Sarah Connor"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Username (Booking Slug)
                  </label>
                  <div className="relative">
                    <span className="text-xs text-slate-400 font-mono absolute left-3 top-1/2 -translate-y-1/2">@</span>
                    <input
                      type="text"
                      disabled
                      value={profile?.username || ''}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Work Email Address
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      disabled
                      value={profile?.email || ''}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Contact / Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Job Title / Designation */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Job Title / Designation
                  </label>
                  <div className="relative">
                    <Briefcase className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium"
                      placeholder="e.g. Senior Solutions Architect"
                    />
                  </div>
                </div>

                {/* Department */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Department / Division
                  </label>
                  <div className="relative">
                    <Building className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium"
                      placeholder="e.g. Infrastructure & Cloud"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Employee ID Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Employee ID / Code
                  </label>
                  <div className="relative">
                    <BadgeAlert className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-mono"
                      placeholder="e.g. KV-EMP-104"
                    />
                  </div>
                </div>

                {/* Office Location */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Office Location / Desk
                  </label>
                  <div className="relative">
                    <MapPin className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={officeLocation}
                      onChange={(e) => setOfficeLocation(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium"
                      placeholder="e.g. Mumbai HQ - Tower B or Remote"
                    />
                  </div>
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Operating Timezone
                </label>
                <div className="relative">
                  <Globe className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium text-slate-800"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bio / About */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  About Me / Bio
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium resize-none text-slate-800"
                  placeholder="Share a brief overview of your role, specialties, and background..."
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{updateProfileMutation.isPending ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Zoho Account & Password Security */}
        <div className="space-y-6">
          {/* 1. Connected Zoho Account (Zoho Calendar & Zoho Meeting) */}
          <Card
            title={
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-cyan-600" />
                <span>Zoho Account & Meeting</span>
              </div>
            }
            subtitle="Sync Zoho Calendar and generate Zoho Meeting links automatically"
          >
            {zohoSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{zohoSuccess}</span>
              </div>
            )}
            {zohoError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{zohoError}</span>
              </div>
            )}

            {isZohoConnected ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-teal-50/40 border border-emerald-200/90 flex items-start gap-3.5 shadow-2xs">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Video className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <Check className="h-3 w-3 text-emerald-700" />
                        Zoho Connected & Ready
                      </span>
                      {profile?.zoho_calendar_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300">
                          Calendar Synced
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 truncate mt-1">
                      {profile?.zoho_email}
                    </p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Zoho Calendar reads busy times and receives new bookings. Zoho Meeting generates instant join links.
                    </p>
                  </div>
                </div>

                {/* Personal Zoho Meeting Link Configuration */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Video className="h-4 w-4 text-cyan-600" />
                      <span>Permanent Zoho Meeting Link (Optional)</span>
                    </label>
                    <a
                      href="https://meeting.zoho.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-600 hover:text-cyan-700 transition-colors"
                    >
                      <span>Get link at meeting.zoho.in</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={zohoMeetUrl}
                      onChange={(e) => setZohoMeetUrl(e.target.value)}
                      placeholder="https://meet.zoho.in/xxx-yyyy-zzz"
                      className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-slate-900 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      disabled={saveMeetUrlMutation.isPending}
                      onClick={() => saveMeetUrlMutation.mutate(zohoMeetUrl)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {saveMeetUrlMutation.isPending ? 'Saving...' : 'Save Link'}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-xl bg-cyan-50/60 border border-cyan-100 text-[11px] text-cyan-900 leading-relaxed">
                    <strong>Automated Dynamic Sessions:</strong> If left empty, unique Zoho Meeting rooms are generated on demand via your connected Zoho account whenever meetings are booked.
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={zohoMeetUrl || 'https://meeting.zoho.in'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Zoho Meeting Portal</span>
                  </a>
                  <button
                    type="button"
                    title="Disconnect Zoho Account"
                    disabled={disconnectZohoMutation.isPending}
                    onClick={() => disconnectZohoMutation.mutate()}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConnectZoho} className="space-y-3.5">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Connect your Zoho account to sync Zoho Calendar availability and automatically generate Zoho Meeting links for your appointments.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Zoho Account Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={zohoEmailInput}
                      onChange={(e) => setZohoEmailInput(e.target.value)}
                      placeholder="e.g. employee@company.com or employee@zohomail.in"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter the Zoho email you use for calendar and hosting meetings.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Permanent Zoho Meeting Link (Optional)
                    </label>
                    <a
                      href="https://meeting.zoho.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-cyan-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      <span>Get link at meeting.zoho.in</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <Video className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="url"
                      value={zohoMeetUrl}
                      onChange={(e) => setZohoMeetUrl(e.target.value)}
                      placeholder="https://meet.zoho.in/xxx-yyyy-zzz"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-slate-900 text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Optional: Provide your personal meeting room or leave blank for dynamic OAuth session generation.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={connectZohoMutation.isPending || initiatingOAuth}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <Video className="h-4 w-4 text-cyan-400" />
                  <span>{connectZohoMutation.isPending ? 'Connecting...' : 'Connect Zoho Account'}</span>
                </button>

                {oauthConfig?.configured && (
                  <button
                    type="button"
                    onClick={handleStartZohoOAuth}
                    disabled={initiatingOAuth}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                  >
                    <span>Or Sign in via Zoho OAuth 2.0</span>
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                  </button>
                )}
              </form>
            )}
          </Card>

          {/* 2. Security & Password Card */}
          <Card
            title={
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-600" />
                <span>Security & Password</span>
              </div>
            }
            subtitle="Update your sign-in credentials"
          >
            {passwordSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}
            {passwordError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password (min. 8 chars)
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  placeholder="••••••••"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="h-4 w-4 text-amber-400" />
                  <span>{changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};
