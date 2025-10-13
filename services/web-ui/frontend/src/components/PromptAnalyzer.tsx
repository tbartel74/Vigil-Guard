import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp, formatTimestampCompact } from '../lib/dateUtils';

interface PromptListItem {
  id: string;
  timestamp: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  preview: string;
}

interface PromptDetails {
  id: string;
  timestamp: string;
  input_raw: string;
  output_final: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  final_action: string;
  pg_score_percent: number;
  sanitizer_score: number;
  main_criteria: string;
}

interface PromptAnalyzerProps {
  timeRange: string; // from parent (Monitoring component)
}

export default function PromptAnalyzer({ timeRange }: PromptAnalyzerProps) {
  const { user } = useAuth();
  const [promptList, setPromptList] = useState<PromptListItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [promptDetails, setPromptDetails] = useState<PromptDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // False Positive reporting state
  const [showFPModal, setShowFPModal] = useState(false);
  const [fpReason, setFpReason] = useState('over_blocking');
  const [fpComment, setFpComment] = useState('');
  const [fpSubmitting, setFpSubmitting] = useState(false);
  const [fpSuccess, setFpSuccess] = useState(false);
  const [fpError, setFpError] = useState<string | null>(null);

  // Get user's timezone preference, default to UTC
  const userTimezone = user?.timezone || 'UTC';

  // Fetch list of prompts when timeRange changes or every 10 seconds
  useEffect(() => {
    fetchPromptList();

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchPromptList();
    }, 10000);

    return () => clearInterval(interval);
  }, [timeRange]);

  // Fetch details when selected prompt changes
  useEffect(() => {
    if (selectedPromptId) {
      fetchPromptDetails(selectedPromptId);
    }
  }, [selectedPromptId]);

  const fetchPromptList = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchPromptList(timeRange);
      console.log('PromptAnalyzer: Fetched prompt list:', data);
      setPromptList(data);

      // Auto-select first prompt
      if (data.length > 0 && !selectedPromptId) {
        console.log('PromptAnalyzer: Auto-selecting first prompt:', data[0].id);
        setSelectedPromptId(data[0].id);
      }
    } catch (err: any) {
      setError('Failed to load prompts: ' + err.message);
      console.error('Error fetching prompt list:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPromptDetails = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchPromptDetails(id);
      setPromptDetails(data);
    } catch (err: any) {
      setError('Failed to load prompt details: ' + err.message);
      console.error('Error fetching prompt details:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ALLOWED':
        return 'text-green-400';
      case 'BLOCKED':
        return 'text-red-400';
      case 'SANITIZED':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ALLOWED':
        return '✓';
      case 'BLOCKED':
        return '✗';
      case 'SANITIZED':
        return '⚠';
      default:
        return '•';
    }
  };

  const handleOpenFPModal = () => {
    setShowFPModal(true);
    setFpReason('over_blocking');
    setFpComment('');
    setFpSuccess(false);
    setFpError(null);
  };

  const handleSubmitFP = async () => {
    if (!promptDetails) return;

    setFpSubmitting(true);
    setFpError(null);

    try {
      const maxScore = Math.max(promptDetails.pg_score_percent, promptDetails.sanitizer_score);

      await api.submitFalsePositiveReport({
        event_id: promptDetails.id,
        reason: fpReason,
        comment: fpComment,
        event_timestamp: promptDetails.timestamp,
        original_input: promptDetails.input_raw,
        final_status: promptDetails.final_status,
        threat_score: maxScore
      });

      setFpSuccess(true);
      setTimeout(() => {
        setShowFPModal(false);
        setFpSuccess(false);
      }, 2000);
    } catch (err: any) {
      setFpError('Failed to submit report: ' + err.message);
    } finally {
      setFpSubmitting(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-700 p-4 bg-[#0C1117]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Prompt Analysis</h2>
          <p className="text-sm text-slate-400">Detailed inspection of security decisions</p>
        </div>

        {/* Status indicator and FP button in top-right */}
        {promptDetails && (
          <div className="flex items-center gap-3">
            {/* Show FP button for BLOCKED/SANITIZED only */}
            {(promptDetails.final_status === 'BLOCKED' || promptDetails.final_status === 'SANITIZED') && (
              <button
                onClick={handleOpenFPModal}
                className="px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-sm font-medium transition-colors"
                title="Report this decision as a false positive"
              >
                Report False Positive
              </button>
            )}

            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              promptDetails.final_status === 'ALLOWED' ? 'bg-green-500/10' :
              promptDetails.final_status === 'BLOCKED' ? 'bg-red-500/10' :
              'bg-yellow-500/10'
            }`}>
              <span className={`text-2xl ${getStatusColor(promptDetails.final_status)}`}>
                {getStatusIcon(promptDetails.final_status)}
              </span>
              <span className={`text-lg font-bold ${getStatusColor(promptDetails.final_status)}`}>
                {promptDetails.final_status}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Dropdown selector */}
      <div className="mb-4 relative z-50">
        <label className="text-xs text-slate-400 block mb-2">Select Prompt</label>
        <select
          value={selectedPromptId || ''}
          onChange={(e) => setSelectedPromptId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white relative z-50"
          disabled={loading || promptList.length === 0}
        >
          {promptList.length === 0 ? (
            <option>No prompts found in this time range</option>
          ) : (
            promptList.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>
                [{formatTimestampCompact(prompt.timestamp, userTimezone)}] {getStatusIcon(prompt.final_status)} {prompt.preview}...
              </option>
            ))
          )}
        </select>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && !promptDetails && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {/* Prompt details display */}
      {promptDetails && !loading && (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-900/50 rounded-lg">
            <div>
              <span className="text-xs text-slate-400">Timestamp:</span>
              <p className="text-sm text-white">{formatTimestamp(promptDetails.timestamp, userTimezone)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Event ID:</span>
              <p className="text-sm text-white font-mono">{promptDetails.id}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Decision Source:</span>
              <p className="text-sm text-white">{promptDetails.final_action}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Main Criteria:</span>
              <p className="text-sm text-white">{promptDetails.main_criteria || 'N/A'}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Prompt Guard Score:</span>
              <p className="text-sm text-white">{promptDetails.pg_score_percent.toFixed(2)}%</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Sanitizer Score:</span>
              <p className="text-sm text-white">{promptDetails.sanitizer_score}</p>
            </div>
          </div>

          {/* Original Prompt - large text area */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">Original Prompt (Input)</label>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
              <pre className="text-sm text-white whitespace-pre-wrap font-mono">
                {promptDetails.input_raw}
              </pre>
            </div>
          </div>

          {/* Output after processing - ALWAYS SHOW */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">
              Output After Decision
              {promptDetails.final_status === 'ALLOWED' && ' (Allowed - No Changes)'}
              {promptDetails.final_status === 'SANITIZED' && ' (Sanitized - Content Modified)'}
              {promptDetails.final_status === 'BLOCKED' && ' (Blocked - Request Rejected)'}
            </label>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 min-h-[150px] max-h-[300px] overflow-y-auto">
              <pre className={`text-sm whitespace-pre-wrap font-mono ${
                promptDetails.final_status === 'BLOCKED' ? 'text-red-400' :
                promptDetails.final_status === 'SANITIZED' ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {promptDetails.output_final || promptDetails.input_raw}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* False Positive Report Modal */}
      {showFPModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-xl font-semibold text-white mb-4">Report False Positive</h3>

            {fpSuccess ? (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-center">
                ✓ Report submitted successfully!
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {/* Event ID display */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Event ID</label>
                    <div className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-300 font-mono">
                      {promptDetails?.id}
                    </div>
                  </div>

                  {/* Reason dropdown */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Reason</label>
                    <select
                      value={fpReason}
                      onChange={(e) => setFpReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                      disabled={fpSubmitting}
                    >
                      <option value="over_blocking">Over-blocking (legitimate content blocked)</option>
                      <option value="over_sanitization">Over-sanitization (too aggressive)</option>
                      <option value="false_detection">False detection (pattern mismatch)</option>
                      <option value="business_logic">Business logic issue</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Comment textarea */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Comment <span className="text-slate-500">(optional)</span>
                    </label>
                    <textarea
                      value={fpComment}
                      onChange={(e) => setFpComment(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white resize-none"
                      rows={4}
                      placeholder="Provide additional context about why this is a false positive..."
                      disabled={fpSubmitting}
                    />
                  </div>

                  {/* Error message */}
                  {fpError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                      {fpError}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowFPModal(false)}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-white text-sm transition-colors"
                    disabled={fpSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitFP}
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={fpSubmitting}
                  >
                    {fpSubmitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
