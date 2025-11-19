import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncPiiConfig } from '../src/piiConfigSync.js';

/**
 * Integration tests for PII configuration sync
 *
 * Tests full syncPiiConfig() workflow with mocked dependencies:
 * - File operations (parseFile, saveChanges, restoreFileFromBackup)
 * - Presidio notification (fetch)
 *
 * Architecture: Integration testing with dependency mocking
 */

// Mock fileOps module
vi.mock('../src/fileOps.js', () => ({
  parseFile: vi.fn(),
  saveChanges: vi.fn(),
  restoreFileFromBackup: vi.fn(),
}));

// Import mocked functions
import * as fileOps from '../src/fileOps.js';

describe('syncPiiConfig - Integration Tests', () => {
  const mockAuthor = 'test-user';
  const mockEtags = {
    'unified_config.json': 'etag-unified-123',
    'pii.conf': 'etag-pii-456',
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set default environment
    delete process.env.SKIP_PRESIDIO_NOTIFY;

    // Mock parseFile to return valid config structure
    vi.mocked(fileOps.parseFile).mockImplementation(async (filename: string) => {
      if (filename === 'unified_config.json') {
        return {
          parsed: {
            pii_detection: {
              enabled: true,
              confidence_threshold: 0.7,
              entities: ['EMAIL_ADDRESS', 'PERSON'],
              redaction_mode: 'replace',
              fallback_to_regex: true,
              languages: ['pl', 'en'],
              redaction_tokens: {},
              detection_mode: 'balanced',
              context_enhancement: true,
            },
          },
          etag: 'etag-unified-123',
        };
      } else if (filename === 'pii.conf') {
        return {
          parsed: {
            rules: [],
            order: [],
            __all_rules: [],
            __all_order: [],
          },
          etag: 'etag-pii-456',
        };
      }
      throw new Error(`Unexpected file: ${filename}`);
    });

    // Mock saveChanges to return success
    vi.mocked(fileOps.saveChanges).mockResolvedValue({
      results: [
        { file: 'unified_config.json', etag: 'etag-unified-new', backupPath: '/backup/unified_config.json' },
        { file: 'pii.conf', etag: 'etag-pii-new', backupPath: '/backup/pii.conf' },
      ],
    });

    // Mock global fetch for Presidio notification
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  describe('Successful sync workflow', () => {
    it('should sync configuration successfully', async () => {
      const payload = {
        enabled: true,
        confidenceThreshold: 0.8,
        enabledEntities: ['EMAIL_ADDRESS', 'PHONE_NUMBER'],
        languages: ['pl', 'en'],
        detectionMode: 'high_security' as const,
      };

      const result = await syncPiiConfig(payload, mockAuthor, mockEtags);

      // Verify parseFile was called for both configs
      expect(fileOps.parseFile).toHaveBeenCalledWith('unified_config.json');
      expect(fileOps.parseFile).toHaveBeenCalledWith('pii.conf');

      // Verify saveChanges was called with correct structure
      expect(fileOps.saveChanges).toHaveBeenCalledWith({
        changes: expect.arrayContaining([
          expect.objectContaining({
            file: 'unified_config.json',
            payloadType: 'json',
            updates: expect.any(Array),
          }),
          expect.objectContaining({
            file: 'pii.conf',
            payloadType: 'json',
            updates: expect.any(Array),
          }),
        ]),
        changeTag: 'pii-config-sync',
        ifMatch: mockEtags,
        author: mockAuthor,
      });

      // Verify Presidio was notified
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/config'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'high_security',
            enable_context_enhancement: true,
          }),
        })
      );

      // Verify result contains new etags
      expect(result).toEqual({
        etags: {
          'unified_config.json': 'etag-unified-new',
          'pii.conf': 'etag-pii-new',
        },
      });
    });

    it('should preserve existing config when payload is partial', async () => {
      const payload = {
        confidenceThreshold: 0.9,
      };

      await syncPiiConfig(payload, mockAuthor, mockEtags);

      // Verify saveChanges received merged config (existing + new)
      const saveCall = vi.mocked(fileOps.saveChanges).mock.calls[0][0];
      const unifiedUpdates = saveCall.changes.find((c: any) => c.file === 'unified_config.json')?.updates;

      expect(unifiedUpdates).toContainEqual(
        expect.objectContaining({
          path: 'pii_detection.confidence_threshold',
          value: 0.9, // New value
        })
      );

      expect(unifiedUpdates).toContainEqual(
        expect.objectContaining({
          path: 'pii_detection.entities',
          value: ['EMAIL_ADDRESS', 'PERSON'], // Preserved from mock
        })
      );
    });
  });

  describe('Validation errors', () => {
    it('should reject invalid payload before file operations', async () => {
      const payload = {
        confidenceThreshold: 2.0, // Invalid (> 1)
      };

      await expect(syncPiiConfig(payload, mockAuthor, mockEtags)).rejects.toThrow(
        'confidenceThreshold must be between 0 and 1'
      );

      // Verify no file operations were performed
      expect(fileOps.parseFile).not.toHaveBeenCalled();
      expect(fileOps.saveChanges).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject unknown entity types', async () => {
      const payload = {
        enabledEntities: ['EMAIL_ADDRESS', 'UNKNOWN_ENTITY'],
      };

      await expect(syncPiiConfig(payload, mockAuthor, mockEtags)).rejects.toThrow(
        'Unknown entity types: UNKNOWN_ENTITY'
      );

      expect(fileOps.parseFile).not.toHaveBeenCalled();
    });

    it('should reject XSS in redaction tokens', async () => {
      const payload = {
        redactionTokens: {
          EMAIL_ADDRESS: '<script>alert(1)</script>',
        },
      };

      await expect(syncPiiConfig(payload, mockAuthor, mockEtags)).rejects.toThrow(
        'contains unsafe characters'
      );

      expect(fileOps.parseFile).not.toHaveBeenCalled();
    });
  });

  describe('Presidio notification failures', () => {
    it('should rollback files when Presidio notification fails', async () => {
      // Mock Presidio failure
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const payload = {
        detectionMode: 'balanced' as const,
      };

      await expect(syncPiiConfig(payload, mockAuthor, mockEtags)).rejects.toThrow(
        'Presidio update failed: HTTP 500'
      );

      // Verify rollback was attempted
      expect(fileOps.restoreFileFromBackup).toHaveBeenCalledWith(
        'unified_config.json',
        '/backup/unified_config.json'
      );
      expect(fileOps.restoreFileFromBackup).toHaveBeenCalledWith(
        'pii.conf',
        '/backup/pii.conf'
      );
    });

    it('should rollback files when Presidio times out', async () => {
      // Mock timeout
      global.fetch = vi.fn().mockRejectedValue({
        name: 'AbortError',
        message: 'The operation was aborted',
      });

      const payload = {
        detectionMode: 'balanced' as const,
      };

      await expect(syncPiiConfig(payload, mockAuthor, mockEtags)).rejects.toThrow(
        'Presidio service timeout'
      );

      // Verify rollback was attempted
      expect(fileOps.restoreFileFromBackup).toHaveBeenCalledTimes(2);
    });

    it('should fail hard when SKIP_PRESIDIO_NOTIFY is set', async () => {
      process.env.SKIP_PRESIDIO_NOTIFY = '1';

      const payload = {
        detectionMode: 'balanced' as const,
      };

      await expect(syncPiiConfig(payload, mockAuthor, mockEtags)).rejects.toThrow(
        'Presidio configuration update skipped'
      );

      // Verify rollback was performed
      expect(fileOps.restoreFileFromBackup).toHaveBeenCalledTimes(2);

      // Verify fetch was NOT called
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('File operation edge cases', () => {
    it('should handle missing pii_detection section in unified_config', async () => {
      vi.mocked(fileOps.parseFile).mockImplementation(async (filename: string) => {
        if (filename === 'unified_config.json') {
          return {
            parsed: {}, // Empty config
            etag: 'etag-unified-123',
          };
        } else if (filename === 'pii.conf') {
          return {
            parsed: { rules: [], order: [] },
            etag: 'etag-pii-456',
          };
        }
        throw new Error(`Unexpected file: ${filename}`);
      });

      const payload = {
        enabled: true,
        enabledEntities: ['EMAIL_ADDRESS'],
      };

      const result = await syncPiiConfig(payload, mockAuthor, mockEtags);

      // Should succeed with defaults
      expect(result.etags).toHaveProperty('unified_config.json');
      expect(fileOps.saveChanges).toHaveBeenCalled();
    });

    it('should bootstrap canonical storage when missing', async () => {
      vi.mocked(fileOps.parseFile).mockImplementation(async (filename: string) => {
        if (filename === 'pii.conf') {
          return {
            parsed: {
              rules: [{ name: 'rule1', target_entity: 'EMAIL_ADDRESS' }],
              order: ['rule1'],
              // Missing __all_rules and __all_order
            },
            etag: 'etag-pii-456',
          };
        }
        return {
          parsed: { pii_detection: {} },
          etag: 'etag-123',
        };
      });

      const payload = {
        enabledEntities: ['EMAIL_ADDRESS'],
      };

      await syncPiiConfig(payload, mockAuthor, mockEtags);

      // Verify saveChanges was called with canonical storage
      const saveCall = vi.mocked(fileOps.saveChanges).mock.calls[0][0];
      const piiConfUpdates = saveCall.changes.find((c: any) => c.file === 'pii.conf')?.updates;

      expect(piiConfUpdates).toContainEqual(
        expect.objectContaining({
          path: '__all_rules',
          value: expect.any(Array),
        })
      );
    });
  });

  describe('ETag concurrency control', () => {
    it('should pass etags to saveChanges for conflict detection', async () => {
      const payload = {
        enabled: true,
      };

      await syncPiiConfig(payload, mockAuthor, mockEtags);

      expect(fileOps.saveChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          ifMatch: mockEtags,
        })
      );
    });

    it('should work without etags (no conflict detection)', async () => {
      const payload = {
        enabled: true,
      };

      await syncPiiConfig(payload, mockAuthor); // No etags

      expect(fileOps.saveChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          ifMatch: undefined,
        })
      );
    });
  });

  describe('Redaction token merging', () => {
    it('should merge new tokens with existing tokens', async () => {
      vi.mocked(fileOps.parseFile).mockImplementation(async (filename: string) => {
        if (filename === 'unified_config.json') {
          return {
            parsed: {
              pii_detection: {
                redaction_tokens: {
                  EMAIL_ADDRESS: '[OLD_EMAIL]',
                  PERSON: '[OLD_PERSON]',
                },
              },
            },
            etag: 'etag-123',
          };
        }
        return { parsed: { rules: [], order: [] }, etag: 'etag-456' };
      });

      const payload = {
        redactionTokens: {
          EMAIL_ADDRESS: '[NEW_EMAIL]', // Override
          PHONE_NUMBER: '[PHONE]',      // New
        },
      };

      await syncPiiConfig(payload, mockAuthor, mockEtags);

      const saveCall = vi.mocked(fileOps.saveChanges).mock.calls[0][0];
      const unifiedUpdates = saveCall.changes.find((c: any) => c.file === 'unified_config.json')?.updates;
      const tokensUpdate = unifiedUpdates?.find((u: any) => u.path === 'pii_detection.redaction_tokens');

      expect(tokensUpdate?.value).toEqual({
        EMAIL_ADDRESS: '[NEW_EMAIL]',   // Overridden
        PERSON: '[OLD_PERSON]',         // Preserved
        PHONE_NUMBER: '[PHONE]',        // Added
      });
    });
  });
});
