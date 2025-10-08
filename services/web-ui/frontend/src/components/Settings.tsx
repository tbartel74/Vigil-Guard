import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../lib/api';

const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw (Poland)' },
  { value: 'Europe/London', label: 'Europe/London (UK)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (France)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (Germany)' },
  { value: 'America/New_York', label: 'America/New_York (US Eastern)' },
  { value: 'America/Chicago', label: 'America/Chicago (US Central)' },
  { value: 'America/Denver', label: 'America/Denver (US Mountain)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (US Pacific)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (China)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UAE)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' }
];

export function Settings() {
  const { user, updateUser } = useAuth();
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.updateSettings({ timezone });
      updateUser({ timezone });
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">User Settings</h1>
        <p className="text-slate-400 mt-2">Configure your personal preferences</p>
      </div>

      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* User Info */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Account Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-400">
                  {user?.username}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-400">
                  {user?.email}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <div className="px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-400 capitalize">
                  {user?.role}
                </div>
              </div>
            </div>
          </div>

          {/* Timezone Settings */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Regional Settings</h2>
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-slate-300 mb-2">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-2">
                All dates and times in the system will be displayed in your selected timezone
              </p>
            </div>
          </div>

          {/* Permissions Info */}
          <div className="pt-6 border-t border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Your Permissions</h2>
            <div className="flex flex-wrap gap-2">
              {user?.can_view_monitoring && (
                <span className="px-3 py-1 text-sm bg-green-500/20 text-green-300 rounded-full">
                  Monitoring Access
                </span>
              )}
              {user?.can_view_configuration && (
                <span className="px-3 py-1 text-sm bg-blue-500/20 text-blue-300 rounded-full">
                  Configuration Access
                </span>
              )}
              {user?.can_manage_users && (
                <span className="px-3 py-1 text-sm bg-purple-500/20 text-purple-300 rounded-full">
                  User Management
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          {message && (
            <div className={`px-4 py-3 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
