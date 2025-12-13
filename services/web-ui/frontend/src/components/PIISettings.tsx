/**
 * PIISettings - PII Detection Configuration Panel
 * Sprint 3.2: Refactored from 636 lines to use modular components
 *
 * Sub-components:
 * - ServiceStatusPanel: Presidio API status display
 * - EntityTypeSelector: Multi-select for PII entity types
 * - PIITestPanel: Live detection testing
 *
 * CRITICAL: ETag logic for concurrency control is preserved in this component
 */

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { parseFile, syncPiiConfig, validatePiiConfig, PiiConfigValidationResult } from '../lib/api';
import descriptions from '../spec/descriptions.json';
import Tooltip from './Tooltip';
import { ServiceStatusPanel, EntityTypeSelector, PIITestPanel } from './pii-settings';

export interface ServiceStatus {
  status: 'online' | 'offline';
  version?: string;
  recognizers_loaded?: number;
  spacy_models?: string[];
  fallback?: string;
  error?: string;
}

export interface EntityType {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface PiiConfig {
  enabled: boolean;
  confidence_threshold: number;
  entities: string[];
  redaction_mode: 'replace' | 'hash' | 'mask';
  fallback_to_regex: boolean;
  languages: string[];
  detection_mode: 'balanced' | 'high_security' | 'high_precision';
  context_enhancement: boolean;
  redaction_tokens: Record<string, string>;
}

export function PIISettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [config, setConfig] = useState<PiiConfig>({
    enabled: true,
    confidence_threshold: 0.7,
    entities: [],
    redaction_mode: 'replace',
    fallback_to_regex: true,
    languages: ['pl', 'en'],
    detection_mode: 'balanced',
    context_enhancement: true,
    redaction_tokens: {}
  });

  // CRITICAL: ETag state for concurrency control - DO NOT REMOVE
  const [fileEtags, setFileEtags] = useState<Record<string, string>>({});

  // Validation state
  const [validationState, setValidationState] = useState<PiiConfigValidationResult | null>(null);
  const [validatingConfig, setValidatingConfig] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);

    try {
      await Promise.all([
        fetchServiceStatus(),
        fetchEntityTypes(),
        fetchConfig()
      ]);
      await runValidation();
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch config:', error);
      toast.error(
        'Failed to load PII configuration from server. Cannot safely edit settings until connection is restored.',
        { duration: 10000 }
      );
      // Keep loading=true to disable save button and prevent dangerous edits
    }
  };

  const fetchServiceStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/pii-detection/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch service status');
      }

      const data = await response.json();
      setServiceStatus(data);
    } catch (error: any) {
      console.error('Failed to fetch PII service status:', error);

      let userMessage = 'PII detection service is offline';
      if (error.message.includes('Failed to fetch')) {
        userMessage += ' (network error - check connection)';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        userMessage += ' (authentication failed - try logging in again)';
      }
      toast.error(userMessage);

      setServiceStatus({
        status: 'offline',
        fallback: 'regex',
        error: error.message
      });
    }
  };

  const fetchEntityTypes = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/pii-detection/entity-types', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch entity types');
      }

      const data = await response.json();
      setEntityTypes(data.entities || []);
    } catch (error: any) {
      console.error('Failed to fetch entity types:', error);
      toast.error('Failed to load entity types');
    }
  };

  // CRITICAL: ETag logic for concurrency control
  const fetchConfig = async () => {
    const file = await parseFile('unified_config.json');
    const piiConfig = file.parsed?.pii_detection;
    if (file?.etag) {
      setFileEtags(prev => ({ ...prev, 'unified_config.json': file.etag }));
    }

    if (piiConfig) {
      setConfig({
        enabled: piiConfig.enabled !== false,
        confidence_threshold: piiConfig.confidence_threshold || 0.7,
        entities: piiConfig.entities || [],
        redaction_mode: piiConfig.redaction_mode || 'replace',
        fallback_to_regex: piiConfig.fallback_to_regex !== false,
        languages: piiConfig.languages || ['pl', 'en'],
        detection_mode: piiConfig.detection_mode || 'balanced',
        context_enhancement: piiConfig.context_enhancement !== false,
        redaction_tokens: piiConfig.redaction_tokens || {}
      });
    }

    const piiFallback = await parseFile('pii.conf');
    if (piiFallback?.etag) {
      setFileEtags(prev => ({ ...prev, 'pii.conf': piiFallback.etag }));
    }
  };

  const runValidation = async () => {
    setValidatingConfig(true);
    setValidationError(null);
    try {
      const result = await validatePiiConfig();
      setValidationState(result);
    } catch (error: any) {
      console.error('Config validation failed:', error);
      setValidationError(error.message || 'Validation failed');
      setValidationState(null);
    } finally {
      setValidatingConfig(false);
    }
  };

  // CRITICAL: ETag passed to syncPiiConfig for concurrency control
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        enabled: config.enabled,
        confidenceThreshold: config.confidence_threshold,
        enabledEntities: config.entities,
        redactionMode: config.redaction_mode,
        fallbackToRegex: config.fallback_to_regex,
        languages: config.languages,
        detectionMode: config.detection_mode,
        contextEnhancement: config.context_enhancement,
        redactionTokens: config.redaction_tokens || {},
        etags: fileEtags  // CRITICAL: Send ETags for conflict detection
      };

      const result = await syncPiiConfig(payload);
      if (result?.etags) {
        setFileEtags(result.etags);  // CRITICAL: Update ETags after save
      }

      toast.success('PII configuration synchronized successfully');
      await fetchConfig();
      await runValidation();
    } catch (error: any) {
      console.error('Save error:', error);
      const errorMsg = error.conflict
        ? 'Configuration changed by another user — reload and try again.'
        : `Error: ${error.message}`;
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleEntityToggle = (entityId: string) => {
    setConfig(prev => ({
      ...prev,
      entities: prev.entities.includes(entityId)
        ? prev.entities.filter(e => e !== entityId)
        : [...prev.entities, entityId]
    }));
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-text-secondary mt-4">Loading PII settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">PII Detection Configuration</h1>
        <p className="text-text-secondary mt-2">Configure Microsoft Presidio for advanced PII detection (50+ entity types)</p>
      </div>

      <div className="space-y-6">
        {/* Service Status Panel */}
        <ServiceStatusPanel serviceStatus={serviceStatus} />

        {/* Validation alerts */}
        {validationError && (
          <div className="rounded-lg border border-red-500 bg-red-900/30 p-4 text-sm text-red-100">
            <div className="font-semibold mb-1">Configuration validation failed</div>
            <div className="flex items-center justify-between">
              <span>{validationError}</span>
              <button
                type="button"
                onClick={runValidation}
                className="px-3 py-1 text-xs font-medium rounded bg-red-500/20 border border-red-400 hover:bg-red-500/30"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="bg-slate-800/50 rounded-lg border border-slate-700 p-6 space-y-6">
          {/* Enable Toggle */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Detection Settings</h2>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="enabled"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              />
              <label htmlFor="enabled" className="text-slate-300 font-medium flex items-center gap-2">
                Enable PII Detection
                {(descriptions as any)['PII_ENABLED'] && (
                  <Tooltip
                    title={(descriptions as any)['PII_ENABLED'].title}
                    description={(descriptions as any)['PII_ENABLED'].description}
                    impact={(descriptions as any)['PII_ENABLED'].impact}
                    category={(descriptions as any)['PII_ENABLED'].category}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                      ?
                    </div>
                  </Tooltip>
                )}
              </label>
            </div>
            <p className="text-xs text-text-secondary mt-2 ml-8">
              When disabled, no PII redaction will occur in prompts
            </p>
          </div>

          {/* Confidence Threshold Slider */}
          <div className="pb-6 border-b border-slate-700">
            <label htmlFor="threshold" className="block text-sm font-medium text-slate-300 mb-3">
              Confidence Threshold: <span className="text-blue-400">{config.confidence_threshold.toFixed(2)}</span>
            </label>
            <input
              id="threshold"
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={config.confidence_threshold}
              onChange={(e) => setConfig({ ...config, confidence_threshold: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-text-secondary mt-2">
              <span>0.5 (more detections, higher false positives)</span>
              <span>1.0 (fewer detections, higher accuracy)</span>
            </div>
            <p className="text-xs text-text-secondary mt-3">
              Lower threshold detects more PII but may include false positives. Higher threshold is more conservative.
            </p>
          </div>

          {/* Redaction Mode */}
          <div className="pb-6 border-b border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-3">Redaction Mode</label>
            <div className="space-y-2">
              {(['replace', 'hash', 'mask'] as const).map((mode) => (
                <label key={mode} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="redaction_mode"
                    value={mode}
                    checked={config.redaction_mode === mode}
                    onChange={() => setConfig({ ...config, redaction_mode: mode })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-slate-300 capitalize">{mode}</div>
                    <div className="text-xs text-text-secondary">
                      {mode === 'replace' && 'Replace with token: [EMAIL], [PESEL], etc.'}
                      {mode === 'hash' && 'Replace with SHA-256 hash (irreversible)'}
                      {mode === 'mask' && 'Partially mask: j***@example.com'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Entity Types Multi-select */}
          <EntityTypeSelector
            entityTypes={entityTypes}
            selectedEntities={config.entities}
            onToggle={handleEntityToggle}
          />

          {/* Fallback & Languages */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Advanced Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="fallback"
                  checked={config.fallback_to_regex}
                  onChange={(e) => setConfig({ ...config, fallback_to_regex: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                />
                <label htmlFor="fallback" className="text-slate-300 flex items-center gap-2">
                  Fallback to Regex Rules
                  <span className="relative group cursor-help">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                      <div className="font-semibold mb-1">Limited Entity Detection in Fallback Mode</div>
                      <div className="space-y-1 text-slate-300">
                        <div>Without Presidio, only 13 regex patterns are available:</div>
                        <div className="font-mono text-[10px] text-amber-200">EMAIL, PHONE, CREDIT_CARD, PESEL, NIP, REGON, IP_ADDRESS, URL, IBAN, SSN, etc.</div>
                        <div className="mt-2 text-amber-200">Not available in fallback mode:</div>
                        <div className="font-mono text-[10px]">PERSON, LOCATION, DATE_TIME, ORGANIZATION, MEDICAL_LICENSE, and 30+ other ML-based entities</div>
                      </div>
                    </div>
                  </span>
                </label>
              </div>
              <p className="text-xs text-text-secondary ml-8">
                If Presidio API is offline, automatically use legacy regex patterns (13 basic rules only)
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Languages</label>
                <div className="flex space-x-4">
                  {['pl', 'en'].map((lang) => (
                    <label key={lang} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.languages.includes(lang)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConfig({ ...config, languages: [...config.languages, lang] });
                          } else {
                            setConfig({ ...config, languages: config.languages.filter(l => l !== lang) });
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-slate-300 uppercase">{lang}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>

        {/* Testing Panel */}
        <PIITestPanel
          config={config}
        />
      </div>
    </div>
  );
}
