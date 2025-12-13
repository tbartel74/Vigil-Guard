/**
 * EventDetailsModal - Modal displaying detailed event information
 * Part of InvestigationV2 component refactoring (Sprint 3.1)
 */

import React from 'react';
import { EventV2Row } from '../../lib/api';
import { getScoreColor, getStatusClasses, formatStatus } from './utils';

interface EventDetailsModalProps {
  event: EventV2Row;
  onClose: () => void;
}

export default function EventDetailsModal({ event, onClose }: EventDetailsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-600 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Event Details</h2>
              <p className="text-sm text-slate-400 mt-1">Event ID: {event.id}</p>
              <p className="text-sm text-slate-400">
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Original Input */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">Original Input</h3>
              <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                {event.original_input}
              </p>
            </div>

            {/* Result Output */}
            {event.result && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Output Returned</h3>
                <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                  {event.result}
                </p>
              </div>
            )}

            {/* 3-Branch Scores */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 border border-amber-500/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-amber-400 mb-2">Branch A (Heuristics)</h3>
                <p className={`text-3xl font-mono ${getScoreColor(event.branch_a_score)}`}>
                  {event.branch_a_score}
                </p>
              </div>

              <div className="bg-slate-800 border border-purple-500/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-2">Branch B (Semantic)</h3>
                <p className={`text-3xl font-mono ${getScoreColor(event.branch_b_score)}`}>
                  {event.branch_b_score}
                </p>
              </div>

              <div className="bg-slate-800 border border-cyan-500/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-cyan-400 mb-2">Branch C (LLM Safety Engine Analysis)</h3>
                <p className={`text-3xl font-mono ${getScoreColor(event.branch_c_score)}`}>
                  {event.branch_c_score}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Combined Score</h3>
                <p className={`text-3xl font-mono ${getScoreColor(event.threat_score)}`}>
                  {event.threat_score}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  Confidence: {(event.confidence * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Decision & Boosts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Final Decision</h3>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusClasses(event.final_status)}`}>
                    {formatStatus(event.final_status)}
                  </span>
                  <span className="text-sm text-text-secondary">
                    ({event.final_decision})
                  </span>
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Priority Boosts Applied</h3>
                {event.boosts_applied.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {event.boosts_applied.map((boost, idx) => (
                      <span key={idx} className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">
                        {boost}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-text-secondary text-sm">None</p>
                )}
              </div>
            </div>

            {/* PII Information */}
            {event.pii_sanitized && (
              <div className="bg-slate-800 border border-blue-500/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-400 mb-2">PII Detection</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-text-secondary text-sm">Entities Found: </span>
                      <span className="text-white font-mono">{event.pii_entities_count}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {event.pii_types_detected.map((type, idx) => (
                        <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                  {event.pii_classification_json && (
                    <div>
                      <span className="text-text-secondary text-sm">Detection Method: </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        event.pii_classification_json.method === 'presidio' ? 'bg-emerald-500/20 text-emerald-400' :
                        event.pii_classification_json.method === 'presidio_dual_language' ? 'bg-emerald-500/20 text-emerald-400' :
                        event.pii_classification_json.method === 'regex_fallback' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {event.pii_classification_json.method || 'unknown'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">Metadata</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-secondary">Client ID: </span>
                  <span className="text-white font-mono">{event.client_id || '-'}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Detected Language: </span>
                  <span className="text-white font-mono">{event.detected_language || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
