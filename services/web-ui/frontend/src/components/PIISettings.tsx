import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { parseFile, saveChanges, resolveSpec } from '../lib/api';
import spec from '../spec/variables.json';

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
    languages: ['pl', 'en']
  });

  // Test panel state
  const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchServiceStatus(),
        fetchEntityTypes(),
        fetchConfig()
      ]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load PII settings');
    } finally {
      setLoading(false);
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
    try {
      const file = await parseFile('unified_config.json');
      const piiConfig = file.parsed?.pii_detection;

      if (piiConfig) {
        setConfig({
          enabled: piiConfig.enabled !== false,
          confidence_threshold: piiConfig.confidence_threshold || 0.7,
          entities: piiConfig.entities || [],
          redaction_mode: piiConfig.redaction_mode || 'replace',
          fallback_to_regex: piiConfig.fallback_to_regex !== false,
          languages: piiConfig.languages || ['pl', 'en']
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch config:', error);

      // Block editing when config load fails to prevent overwriting production config with defaults
      toast.error(
        'Failed to load PII configuration from server. Cannot safely edit settings until connection is restored.',
        { duration: 10000 }
      );

      setLoading(true);  // Keep loading state to disable save button
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
      // Build updates for unified_config.json
      const updates = [
        { path: 'pii_detection.enabled', value: config.enabled },
        { path: 'pii_detection.confidence_threshold', value: config.confidence_threshold },
        { path: 'pii_detection.entities', value: config.entities },
        { path: 'pii_detection.redaction_mode', value: config.redaction_mode },
        { path: 'pii_detection.fallback_to_regex', value: config.fallback_to_regex },
        { path: 'pii_detection.languages', value: config.languages }
      ];

      const changes = [{
        file: 'unified_config.json',
        payloadType: 'json' as const,
        updates
      }];

      const changeTag = user.username;
      const result = await saveChanges({ changes, spec, changeTag });

      toast.success('PII configuration saved successfully');
      await fetchConfig(); // Refresh to confirm
    } catch (error: any) {
      console.error('Save error:', error);
      const errorMsg = error.conflict
        ? 'File changed on disk — reload or force save.'
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

    // Input validation: 10,000 character limit (backend constraint)
    if (testText.length > 10000) {
      toast.error(`Test text is too long (${testText.length} characters). Maximum allowed: 10,000 characters.`);
      return;
    }

    setTesting(true);
    setTestResults(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/pii-detection/analyze', {
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
      toast.success(`Detected ${data.entities?.length || 0} PII entities`);
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
                <label htmlFor="fallback" className="text-slate-300">
                  Fallback to Regex Rules
                </label>
              </div>
              <p className="text-xs text-text-secondary ml-8">
                If Presidio API is offline, automatically use legacy regex patterns (13 rules)
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
                      Detected: <span className="text-blue-400 font-medium">{testResults.entities?.length || 0} entities</span>
                    </div>
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
