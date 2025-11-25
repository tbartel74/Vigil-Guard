import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';

interface ConfigFile {
  name: string;
  ext: string;
}

export default function FileManager() {
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [auditLog, setAuditLog] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
    loadAuditLog();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listConfigFiles();
      setFiles(data.files || []);
    } catch (err: any) {
      setError('Failed to load configuration files: ' + err.message);
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLog = async () => {
    try {
      const data = await api.fetchAuditLog();
      setAuditLog(data.content || '');
    } catch (err: any) {
      console.error('Error loading audit log:', err);
      setAuditLog('Failed to load audit log: ' + err.message);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      setError(null);
      const content = await api.downloadConfigFile(filename);

      // Create download link
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSuccessMessage(`File "${filename}" downloaded successfully`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError('Failed to download file: ' + err.message);
    }
  };

  const handleUpload = async (expectedFilename: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(expectedFilename);
      setError(null);

      // Validate filename matches
      if (file.name !== expectedFilename) {
        setError(`Filename mismatch: expected "${expectedFilename}" but selected "${file.name}". Please select the correct file.`);
        event.target.value = '';
        setUploadingFile(null);
        return;
      }

      const content = await file.text();
      await api.uploadConfigFile(expectedFilename, content, file.name);

      setSuccessMessage(`File "${expectedFilename}" uploaded successfully`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload audit log to show new entry
      loadAuditLog();

      // Reset file input
      event.target.value = '';
    } catch (err: any) {
      setError('Failed to upload file: ' + err.message);
    } finally {
      setUploadingFile(null);
    }
  };

  const configFiles = [
    { name: 'unified_config.json', description: 'Main configuration file with detection settings, Arbiter weights, bloom filter, and sanitization policies (v2.0.0)' },
    { name: 'pii.conf', description: 'PII redaction patterns for sensitive data detection and removal' },
    { name: 'allowlist.schema.json', description: 'JSON Schema for allowlist validation and structure definition' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Configuration File Editor</h1>
        <p className="text-text-secondary mt-2">
          Download and upload configuration files. All changes are logged in the audit log below.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400">
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          {/* Configuration Files Section */}
          <div className="space-y-4 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Configuration Files</h2>

            {configFiles.map((file) => (
              <div
                key={file.name}
                className="rounded-lg border border-slate-700 bg-slate-900/50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-md font-semibold text-white">{file.name}</h3>
                    <p className="text-sm text-text-secondary mt-1">{file.description}</p>
                  </div>

                  <div className="flex gap-2 ml-4">
                    {/* Download Button */}
                    <button
                      onClick={() => handleDownload(file.name)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                      title="Download current file"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </span>
                    </button>

                    {/* Upload Button */}
                    <label className="relative">
                      <input
                        type="file"
                        onChange={(e) => handleUpload(file.name, e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".json,.conf"
                        disabled={uploadingFile === file.name}
                      />
                      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
                        uploadingFile === file.name
                          ? 'bg-gray-600 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 cursor-pointer'
                      } text-white`}>
                        {uploadingFile === file.name ? (
                          <>
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Upload New
                          </>
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Audit Log Section */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Audit Log</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Complete history of all file upload operations with timestamps and user information
                </p>
              </div>
              <button
                onClick={loadAuditLog}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors"
                title="Refresh audit log"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </span>
              </button>
            </div>

            <div className="bg-slate-950 rounded border border-slate-800 p-4 overflow-x-auto">
              <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap min-h-[300px] max-h-[500px] overflow-y-auto">
                {auditLog || 'No audit log entries yet'}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
