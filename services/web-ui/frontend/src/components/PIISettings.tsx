import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { parseFile, syncPiiConfig, validatePiiConfig, PiiConfigValidationResult } from '../lib/api';

interface ServiceStatus {
  status: 'online' | 'offline';
  version?: string;
  recognizers_loaded?: number;
  spacy_models?: string[];
  fallback?: string;
  error?: string;
}

interface EntityType {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface PiiConfig {
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
  const [fileEtags, setFileEtags] = useState<Record<string, string>>({});

  // Test panel state
  const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<any>(null);
  const [testing, setTesting] = useState(false);
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

      // Success - enable form editing
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch config:', error);

      // Block editing when config load fails to prevent overwriting production config with defaults
      toast.error(
        'Failed to load PII configuration from server. Cannot safely edit settings until connection is restored.',
        { duration: 10000 }
      );

      // Keep loading=true to disable save button and prevent dangerous edits
      // User must refresh page or fix connection to retry
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

      // Show user-friendly error toast
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
        etags: fileEtags
      };

      const result = await syncPiiConfig(payload);
      if (result?.etags) {
        setFileEtags(result.etags);
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

  const handleTestDetection = async () => {
    if (!testText.trim()) {
      toast.error('Please enter test text');
      return;
    }

    // Input validation: 20,000 character limit (backend constraint)
    if (testText.length > 20000) {
      toast.error(`Test text is too long (${testText.length} characters). Maximum allowed: 20,000 characters.`);
      return;
    }

    setTesting(true);
    setTestResults(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/pii-detection/analyze-full', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: testText,
          language: config.languages[0] || 'pl',
          entities: config.entities.length > 0 ? config.entities : undefined,
          score_threshold: config.confidence_threshold,
          return_decision_process: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setTestResults(data);
      const detectedCount = data?.language_stats?.total_after_dedup ?? data?.entities?.length ?? 0;
      toast.success(`Detected ${detectedCount} PII entities`);
    } catch (error: any) {
      console.error('Test error:', error);
      toast.error(`Test failed: ${error.message}`);
      setTestResults({ error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const getStatusColor = () => {
    if (!serviceStatus) return 'bg-slate-600';
    return serviceStatus.status === 'online' ? 'bg-green-500' : 'bg-red-500';
  };

  const getStatusText = () => {
    if (!serviceStatus) return 'Unknown';
    return serviceStatus.status === 'online' ? 'Online' : 'Offline';
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
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Service Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
              <div>
                <div className="text-sm text-slate-400">Presidio API</div>
                <div className="text-white font-medium">{getStatusText()}</div>
              </div>
            </div>
            {serviceStatus?.status === 'online' && (
              <>
                <div>
                  <div className="text-sm text-slate-400">Recognizers Loaded</div>
                  <div className="text-white font-medium">{serviceStatus.recognizers_loaded || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">spaCy Models</div>
                  <div className="text-white font-medium">{serviceStatus.spacy_models?.length || 0} loaded</div>
                </div>
              </>
            )}
            {serviceStatus?.status === 'offline' && (
              <div className="col-span-2">
                <div className="text-sm text-slate-400">Fallback Mode</div>
                <div className="text-yellow-400 font-medium">Using regex rules (13 patterns)</div>
              </div>
            )}
          </div>
        </div>

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
              <label htmlFor="enabled" className="text-slate-300 font-medium">
                Enable PII Detection
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
          <div className="pb-6 border-b border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Detected Entity Types ({config.entities.length} selected)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {entityTypes.map((entity) => (
                <label key={entity.id} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-700 hover:bg-slate-800/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={config.entities.includes(entity.id)}
                    onChange={() => handleEntityToggle(entity.id)}
                    className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 font-medium text-sm">{entity.name}</div>
                    <div className="text-xs text-blue-400 capitalize">{entity.category}</div>
                    <div className="text-xs text-text-secondary mt-1">{entity.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

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
                      <div className="font-semibold mb-1">⚠️ Limited Entity Detection in Fallback Mode</div>
                      <div className="space-y-1 text-slate-300">
                        <div>Without Presidio, only 13 regex patterns are available:</div>
                        <div className="font-mono text-[10px] text-amber-200">EMAIL, PHONE, CREDIT_CARD, PESEL, NIP, REGON, IP_ADDRESS, URL, IBAN, SSN, etc.</div>
                        <div className="mt-2 text-amber-200">Not available in fallback mode:</div>
                        <div className="font-mono text-[10px]">PERSON, LOCATION, DATE_TIME, ORGANIZATION, MEDICAL_LICENSE, CRYPTO, AU_ABN, AU_ACN, AU_TFN, AU_MEDICARE, ES_NIF, FI_NIF, FR_NIR, IN_PAN, IT_CF, IT_IVA, SG_NRIC_FIN, UK_NHS, and 30+ other ML-based entities</div>
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
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Test PII Detection</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="testText" className="block text-sm font-medium text-slate-300 mb-2">
                Test Text
              </label>
              <textarea
                id="testText"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Enter text to test PII detection (e.g., 'Jan Kowalski, PESEL 92032100157, email: jan@example.com')"
                rows={4}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleTestDetection}
              disabled={testing || !testText.trim()}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing...' : 'Test Detection'}
            </button>

            {testResults && (
              <div className="mt-4 p-4 bg-slate-900 border border-slate-700 rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-2">Results:</h3>
                {testResults.error ? (
                  <div className="text-red-400 text-sm">{testResults.error}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-300">
                      Detected: <span className="text-blue-400 font-medium">{testResults.language_stats?.total_after_dedup ?? testResults.entities?.length ?? 0} entities</span>
                    </div>
                    {testResults.redacted_text && (
                      <div className="text-xs text-slate-400">
                        Redacted Text: <span className="text-blue-300 font-mono break-words">{testResults.redacted_text}</span>
                      </div>
                    )}
                    {testResults.language_stats && (
                      <div className="text-xs text-slate-400 space-y-1">
                        <div>Detected Language: <span className="text-blue-300">{testResults.language_stats.detected_language}</span></div>
                        <div>Primary Language: <span className="text-blue-300">{testResults.language_stats.primary_language}</span></div>
                        <div>Polish Entities: <span className="text-blue-300">{testResults.language_stats.polish_entities_retained ?? testResults.language_stats.polish_entities ?? 0}</span></div>
                        <div>English Entities: <span className="text-blue-300">{testResults.language_stats.english_entities_retained ?? testResults.language_stats.english_entities ?? 0}</span></div>
                        {testResults.language_stats.regex_entities_retained !== undefined && (
                          <div>Regex Entities: <span className="text-blue-300">{testResults.language_stats.regex_entities_retained}</span></div>
                        )}
                      </div>
                    )}
                    {testResults.entities && testResults.entities.length > 0 && (
                      <div className="space-y-2 mt-3">
                        {testResults.entities.map((entity: any, idx: number) => (
                          <div key={idx} className="p-3 bg-slate-800 rounded border border-slate-700">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="text-sm font-medium text-white">{entity.type}</div>
                                <div className="text-xs text-slate-400 mt-1">
                                  Text: <span className="text-blue-300 font-mono">{entity.text}</span>
                                </div>
                                <div className="text-xs text-slate-400">
                                  Position: {entity.start}-{entity.end}
                                </div>
                                {entity.source_language && (
                                  <div className="text-xs text-slate-500">
                                    Source: {entity.source_language}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300">
                                {(entity.score * 100).toFixed(0)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
