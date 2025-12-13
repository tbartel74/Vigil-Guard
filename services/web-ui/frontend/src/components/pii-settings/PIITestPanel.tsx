/**
 * PIITestPanel - Test panel for PII detection
 * Part of PIISettings component refactoring (Sprint 3.2)
 *
 * Self-contained component with internal state management
 * Uses config prop for test parameters (entities, threshold, languages)
 */

import React, { useState } from 'react';
import toast from 'react-hot-toast';

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

interface PIITestPanelProps {
  config: PiiConfig;
}

export default function PIITestPanel({ config }: PIITestPanelProps) {
  // Internal state for test panel
  const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<any>(null);
  const [testing, setTesting] = useState(false);

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

  return (
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
                  Detected: <span className="text-blue-400 font-medium">
                    {testResults.language_stats?.total_after_dedup ?? testResults.entities?.length ?? 0} entities
                  </span>
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
                    <div>Polish Entities: <span className="text-blue-300">
                      {testResults.language_stats.polish_entities_retained ?? testResults.language_stats.polish_entities ?? 0}
                    </span></div>
                    <div>English Entities: <span className="text-blue-300">
                      {testResults.language_stats.english_entities_retained ?? testResults.language_stats.english_entities ?? 0}
                    </span></div>
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
  );
}
