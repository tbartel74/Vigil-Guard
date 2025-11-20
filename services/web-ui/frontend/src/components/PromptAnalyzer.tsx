import React, { useState, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
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
  refreshInterval: number; // from parent (0 = disabled, or seconds)
}

export default function PromptAnalyzer({ timeRange, refreshInterval }: PromptAnalyzerProps) {
  const { user } = useAuth();
  const [promptList, setPromptList] = useState<PromptListItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [promptDetails, setPromptDetails] = useState<PromptDetails | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Quality reporting state (FP & TP)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<'FP' | 'TP'>('FP');
  const [reportReason, setReportReason] = useState('over_blocking');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Get user's timezone preference, default to UTC
  const userTimezone = user?.timezone || 'UTC';

  // Fetch list of prompts when timeRange changes or when refreshInterval is active
  useEffect(() => {
    fetchPromptList();

    // Auto-refresh based on parent's refreshInterval (0 = disabled)
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchPromptList();
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [timeRange, refreshInterval]);

  // Fetch details when selected prompt changes
  useEffect(() => {
    if (selectedPromptId) {
      fetchPromptDetails(selectedPromptId);
    }
  }, [selectedPromptId]);

  const fetchPromptList = async () => {
    try {
      setIsListLoading(true);
      setListError(null);
      const data = await api.fetchPromptList(timeRange);
      console.log('PromptAnalyzer: Fetched prompt list:', data);
      setPromptList(data);

      // Auto-select first prompt
      if (data.length > 0 && !selectedPromptId) {
        console.log('PromptAnalyzer: Auto-selecting first prompt:', data[0].id);
        setSelectedPromptId(data[0].id);
      }
    } catch (err: any) {
      setListError('Failed to load prompts: ' + err.message);
      console.error('Error fetching prompt list:', err);
    } finally {
      setIsListLoading(false);
    }
  };

  const fetchPromptDetails = async (id: string) => {
    try {
      setIsDetailsLoading(true);
      setDetailsError(null);
      const data = await api.fetchPromptDetails(id);
      setPromptDetails(data);
    } catch (err: any) {
      setDetailsError('Failed to load prompt details: ' + err.message);
      console.error('Error fetching prompt details:', err);
    } finally {
      setIsDetailsLoading(false);
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

  const handleOpenReportModal = (type: 'FP' | 'TP') => {
    setReportType(type);
    setShowReportModal(true);
    // Set default reason based on type and current status
    if (promptDetails?.final_status === 'ALLOWED') {
      setReportReason(type === 'FP' ? 'missed_attack' : 'correctly_allowed');
    } else {
      setReportReason(type === 'FP' ? 'over_blocking' : 'correctly_blocked');
    }
    setReportComment('');
    setReportSuccess(false);
    setReportError(null);
  };

  const handleSubmitReport = async () => {
    if (!promptDetails) return;

    setReportSubmitting(true);
    setReportError(null);

    try {
      // Use the new unified submitQualityReport function
      const response = await api.submitQualityReport({
        event_id: promptDetails.id,
        report_type: reportType,
        reason: reportReason,
        comment: reportComment
      });

      console.log('Quality report submitted:', response);
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
      }, 2000);
    } catch (err: any) {
      setReportError('Failed to submit report: ' + err.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-700 p-4 bg-surface-darker">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Prompt Analysis</h2>
          <p className="text-sm text-text-secondary">Detailed inspection of security decisions</p>
        </div>

        {/* Status indicator and reporting buttons in top-right */}
        {promptDetails && (
          <div className="flex items-center gap-3">
            {/* Show FP/TP buttons for BLOCKED/SANITIZED */}
            {(promptDetails.final_status === 'BLOCKED' || promptDetails.final_status === 'SANITIZED') && (
              <>
                <button
                  onClick={() => handleOpenReportModal('FP')}
                  className="px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-sm font-medium transition-colors"
                  title="Report this decision as a false positive (incorrectly blocked)"
                >
                  Report FP
                </button>
                <button
                  onClick={() => handleOpenReportModal('TP')}
                  className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium transition-colors"
                  title="Report as correctly blocked (worth analyzing)"
                >
                  Report TP
                </button>
              </>
            )}

            {/* Show FP/TP buttons for ALLOWED - these are critical for security analysis */}
            {promptDetails.final_status === 'ALLOWED' && (
              <>
                <button
                  onClick={() => handleOpenReportModal('FP')}
                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium transition-colors"
                  title="Report as missed attack (should have been blocked)"
                >
                  Report Missed Attack
                </button>
                <button
                  onClick={() => handleOpenReportModal('TP')}
                  className="px-3 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors"
                  title="Mark as correctly allowed (legitimate traffic)"
                >
                  Mark Correct
                </button>
              </>
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
        <label className="text-xs text-text-secondary block mb-2">Select Prompt</label>
        <select
          value={selectedPromptId || ''}
          onChange={(e) => setSelectedPromptId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white relative z-50 truncate"
          disabled={isListLoading || promptList.length === 0}
          style={{ maxWidth: '100%' }}
        >
          {promptList.length === 0 ? (
            <option>No prompts found in this time range</option>
          ) : (
            promptList.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>
                [{formatTimestampCompact(prompt.timestamp, userTimezone)}] {getStatusIcon(prompt.final_status)} {prompt.preview.substring(0, 80)}...
              </option>
            ))
          )}
        </select>
      </div>

      {/* List error with retry button */}
      {listError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm flex items-center justify-between">
          <span>{listError}</span>
          <button
            onClick={fetchPromptList}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-400 text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Details error with retry button */}
      {detailsError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm flex items-center justify-between">
          <span>{detailsError}</span>
          <button
            onClick={() => selectedPromptId && fetchPromptDetails(selectedPromptId)}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-400 text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeleton screen for loading details */}
      {isDetailsLoading && (
        <div className="space-y-4 animate-pulse">
          {/* Metadata skeleton */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-900/50 rounded-lg">
            {[...Array(6)].map((_, i) => (
              <div key={i}>
                <div className="h-3 bg-slate-700 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-slate-700 rounded w-3/4"></div>
              </div>
            ))}
          </div>
          {/* Text area skeletons */}
          <div>
            <div className="h-3 bg-slate-700 rounded w-1/4 mb-2"></div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 h-[200px]">
              <div className="space-y-2">
                <div className="h-4 bg-slate-700 rounded"></div>
                <div className="h-4 bg-slate-700 rounded w-5/6"></div>
                <div className="h-4 bg-slate-700 rounded w-4/6"></div>
              </div>
            </div>
          </div>
          <div>
            <div className="h-3 bg-slate-700 rounded w-1/4 mb-2"></div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 h-[150px]">
              <div className="space-y-2">
                <div className="h-4 bg-slate-700 rounded"></div>
                <div className="h-4 bg-slate-700 rounded w-4/6"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt details display */}
      {promptDetails && !isDetailsLoading && (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-900/50 rounded-lg">
            <div>
              <span className="text-xs text-text-secondary">Timestamp:</span>
              <p className="text-sm text-white">{formatTimestamp(promptDetails.timestamp, userTimezone)}</p>
            </div>
            <div>
              <span className="text-xs text-text-secondary">Event ID:</span>
              <p className="text-sm text-white font-mono">{promptDetails.id}</p>
            </div>
            <div>
              <span className="text-xs text-text-secondary">Decision Source:</span>
              <p className="text-sm text-white">{promptDetails.final_action}</p>
            </div>
            <div>
              <span className="text-xs text-text-secondary">Main Criteria:</span>
              <p className="text-sm text-white">{promptDetails.main_criteria || 'N/A'}</p>
            </div>
            <div>
              <span className="text-xs text-text-secondary">Prompt Guard Score:</span>
              <p className="text-sm text-white">{promptDetails.pg_score_percent.toFixed(2)}%</p>
            </div>
            <div>
              <span className="text-xs text-text-secondary">Sanitizer Score:</span>
              <p className="text-sm text-white">{promptDetails.sanitizer_score}</p>
            </div>
          </div>

          {/* Original Prompt - large text area */}
          <div>
            <label className="text-xs text-text-secondary block mb-2">Original Prompt (Input)</label>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto overflow-x-hidden">
              <pre className="text-sm text-white whitespace-pre-wrap font-mono break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {promptDetails.input_raw}
              </pre>
            </div>
          </div>

          {/* Output after processing - ALWAYS SHOW */}
          <div>
            <label className="text-xs text-text-secondary block mb-2">
              Output After Decision
              {promptDetails.final_status === 'ALLOWED' && ' (Allowed - No Changes)'}
              {promptDetails.final_status === 'SANITIZED' && ' (Sanitized - Content Modified)'}
              {promptDetails.final_status === 'BLOCKED' && ' (Blocked - Request Rejected)'}
            </label>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 min-h-[150px] max-h-[300px] overflow-y-auto overflow-x-hidden">
              <pre className={`text-sm whitespace-pre-wrap font-mono break-words ${
                promptDetails.final_status === 'BLOCKED' ? 'text-red-400' :
                promptDetails.final_status === 'SANITIZED' ? 'text-yellow-400' :
                'text-green-400'
              }`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {promptDetails.output_final || promptDetails.input_raw}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Quality Report Modal (FP & TP) */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <FocusTrap>
            <div
              className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-modal-title"
            >
              <h3 id="report-modal-title" className="text-xl font-semibold text-white mb-4">
                {promptDetails?.final_status === 'ALLOWED'
                  ? (reportType === 'FP' ? 'Report Missed Attack' : 'Confirm Correct Allow')
                  : (reportType === 'FP' ? 'Report False Positive' : 'Report True Positive')
                }
              </h3>

            {reportSuccess ? (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-center">
                ✓ Report submitted successfully!
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {/* Report Type Badge */}
                  <div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                      promptDetails?.final_status === 'ALLOWED'
                        ? (reportType === 'FP' ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30')
                        : (reportType === 'FP' ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-blue-500/10 border border-blue-500/30')
                    }`}>
                      <span className={`text-sm font-medium ${
                        promptDetails?.final_status === 'ALLOWED'
                          ? (reportType === 'FP' ? 'text-red-400' : 'text-green-400')
                          : (reportType === 'FP' ? 'text-orange-400' : 'text-blue-400')
                      }`}>
                        {promptDetails?.final_status === 'ALLOWED'
                          ? (reportType === 'FP' ? '🚨 Missed Attack' : '✅ Correctly Allowed')
                          : (reportType === 'FP' ? '⚠ Incorrectly Blocked' : '✓ Correctly Blocked')
                        }
                      </span>
                    </div>
                  </div>

                  {/* Event ID display */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Event ID</label>
                    <div className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-300 font-mono">
                      {promptDetails?.id}
                    </div>
                  </div>

                  {/* Reason dropdown */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Reason</label>
                    <select
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                      disabled={reportSubmitting}
                    >
                      {/* Different options based on status and report type */}
                      {promptDetails?.final_status === 'ALLOWED' ? (
                        // Options for ALLOWED prompts
                        reportType === 'FP' ? (
                          <>
                            <option value="missed_attack">Missed attack (should have been blocked)</option>
                            <option value="prompt_injection">Contained prompt injection</option>
                            <option value="jailbreak_attempt">Jailbreak attempt passed through</option>
                            <option value="malicious_content">Malicious content not detected</option>
                            <option value="other">Other security concern</option>
                          </>
                        ) : (
                          <>
                            <option value="correctly_allowed">Correctly allowed (legitimate)</option>
                            <option value="benign_content">Confirmed benign content</option>
                            <option value="false_alarm_avoided">False alarm avoided</option>
                            <option value="good_threshold">Good threshold calibration</option>
                            <option value="other">Other confirmation</option>
                          </>
                        )
                      ) : (
                        // Options for BLOCKED/SANITIZED prompts
                        reportType === 'FP' ? (
                          <>
                            <option value="over_blocking">Over-blocking (legitimate content blocked)</option>
                            <option value="over_sanitization">Over-sanitization (too aggressive)</option>
                            <option value="false_detection">False detection (pattern mismatch)</option>
                            <option value="business_logic">Business logic issue</option>
                            <option value="other">Other</option>
                          </>
                        ) : (
                          <>
                            <option value="correctly_blocked">Correctly blocked (worth analyzing)</option>
                            <option value="pattern_improvement">Pattern improvement opportunity</option>
                            <option value="threshold_tuning">Threshold tuning needed</option>
                            <option value="edge_case">Interesting edge case</option>
                            <option value="other">Other</option>
                          </>
                        )
                      )}
                    </select>
                  </div>

                  {/* Comment textarea */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">
                      Comment <span className="text-text-secondary">(optional)</span>
                    </label>
                    <textarea
                      value={reportComment}
                      onChange={(e) => setReportComment(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white resize-none"
                      rows={4}
                      placeholder={reportType === 'FP'
                        ? "Provide additional context about why this is a false positive..."
                        : "Explain why this is worth analyzing or what insights it provides..."
                      }
                      disabled={reportSubmitting}
                    />
                  </div>

                  {/* Error message */}
                  {reportError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                      {reportError}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-white text-sm transition-colors"
                    disabled={reportSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    className={`flex-1 px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      reportType === 'FP' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                    disabled={reportSubmitting}
                  >
                    {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
