import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Palette, Image, Globe, Type, Save, CheckCircle2, RefreshCw } from "lucide-react";

interface BrandingField {
  value: string;
  description: string;
  default: string;
}

type BrandingData = Record<string, BrandingField>;

export const BrandingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: branding, isLoading } = useQuery<BrandingData>({
    queryKey: ["branding-admin"],
    queryFn: async () => {
      const res = await api.get("/admin/branding");
      return res.data as BrandingData;
    },
  });

  // Hydrate form when data loads
  useEffect(() => {
    if (branding && Object.keys(form).length === 0) {
      const initial: Record<string, string> = {};
      Object.entries(branding).forEach(([k, v]) => {
        initial[k] = v.value;
      });
      setForm(initial);
    }
  }, [branding]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await api.put("/admin/branding", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branding-admin"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      company_name: form.company_name,
      logo_url: form.logo_url,
      favicon_url: form.favicon_url,
      primary_color: form.primary_color,
      booking_page_headline: form.booking_page_headline,
      booking_page_subtext: form.booking_page_subtext,
      support_email: form.support_email,
      footer_text: form.footer_text,
      hide_powered_by: form.hide_powered_by === "true",
      custom_css: form.custom_css,
    });
  };

  const set = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const desc = (key: string) => branding?.[key]?.description ?? "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <RefreshCw className="h-6 w-6 text-cyan-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Custom Branding</h1>
          <p className="text-sm text-slate-500 mt-1">
            White-label your public booking pages, emails, and interface.
          </p>
        </div>
        {saved && (
          <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            <span>Branding saved!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Organisation Identity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Globe className="h-4 w-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Organisation Identity</h2>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Company Name
            </label>
            <input
              type="text"
              value={form.company_name || ""}
              onChange={(e) => set("company_name", e.target.value)}
              placeholder="Kavach Connect"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            />
            <p className="text-[11px] text-slate-400">{desc("company_name")}</p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Support Email
            </label>
            <input
              type="email"
              value={form.support_email || ""}
              onChange={(e) => set("support_email", e.target.value)}
              placeholder="support@yourcompany.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            />
            <p className="text-[11px] text-slate-400">{desc("support_email")}</p>
          </div>
        </div>

        {/* Visual Branding */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Palette className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Visual Branding</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Logo URL
              </label>
              <input
                type="url"
                value={form.logo_url || ""}
                onChange={(e) => set("logo_url", e.target.value)}
                placeholder="https://cdn.example.com/logo.png"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
              />
              <p className="text-[11px] text-slate-400">{desc("logo_url")}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Favicon URL
              </label>
              <input
                type="url"
                value={form.favicon_url || ""}
                onChange={(e) => set("favicon_url", e.target.value)}
                placeholder="https://cdn.example.com/favicon.ico"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
              />
              <p className="text-[11px] text-slate-400">{desc("favicon_url")}</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Primary Color
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={form.primary_color || "#0284c7"}
                onChange={(e) => set("primary_color", e.target.value)}
                className="h-10 w-16 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={form.primary_color || ""}
                onChange={(e) => set("primary_color", e.target.value)}
                placeholder="#0284c7"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
              />
            </div>
            <p className="text-[11px] text-slate-400">{desc("primary_color")}</p>
          </div>

          {form.logo_url && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center space-x-3">
              <Image className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-500 mr-2">Preview:</span>
              <img
                src={form.logo_url}
                alt="Logo preview"
                className="h-8 max-w-32 object-contain rounded"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              />
            </div>
          )}
        </div>

        {/* Booking Page Content */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Type className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Booking Page Content</h2>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Page Headline
            </label>
            <input
              type="text"
              value={form.booking_page_headline || ""}
              onChange={(e) => set("booking_page_headline", e.target.value)}
              placeholder="Schedule a Meeting"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            />
            <p className="text-[11px] text-slate-400">{desc("booking_page_headline")}</p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Page Sub-headline
            </label>
            <input
              type="text"
              value={form.booking_page_subtext || ""}
              onChange={(e) => set("booking_page_subtext", e.target.value)}
              placeholder="Choose a time that works for you."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            />
            <p className="text-[11px] text-slate-400">{desc("booking_page_subtext")}</p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Footer Text
            </label>
            <input
              type="text"
              value={form.footer_text || ""}
              onChange={(e) => set("footer_text", e.target.value)}
              placeholder="Powered by Kavach Connect"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Hide &quot;Powered by Kavach Connect&quot; badge</p>
              <p className="text-[11px] text-slate-400">{desc("hide_powered_by")}</p>
            </div>
            <button
              type="button"
              onClick={() => set("hide_powered_by", form.hide_powered_by === "true" ? "false" : "true")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.hide_powered_by === "true" ? "bg-cyan-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.hide_powered_by === "true" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Advanced — Custom CSS */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-mono text-slate-600">{"</>"}</span>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Custom CSS</h2>
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Advanced</span>
          </div>
          <p className="text-[11px] text-slate-400">{desc("custom_css")}</p>
          <textarea
            rows={6}
            value={form.custom_css || ""}
            onChange={(e) => set("custom_css", e.target.value)}
            placeholder={`/* Custom CSS for public booking pages */\n.modal-sheet { border-radius: 24px; }`}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            spellCheck={false}
          />
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-sm font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
          >
            <Save className="h-4 w-4" />
            <span>{saveMutation.isPending ? "Saving..." : "Save Branding"}</span>
          </button>
        </div>

        {saveMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
            {(saveMutation.error as any)?.response?.data?.detail || "Failed to save branding."}
          </div>
        )}
      </form>
    </div>
  );
};
