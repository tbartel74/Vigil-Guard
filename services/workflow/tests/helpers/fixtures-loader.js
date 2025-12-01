/**
 * Fixtures Loader for Vigil Guard Tests v3.0
 *
 * Klasyfikacja zgodna z OWASP LLM Top 10 (2025)
 *
 * Źródła:
 * - https://genai.owasp.org/llmrisk/llm01-prompt-injection/
 * - https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
 * - https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures');
const EXTERNAL_PROMPTS = '/Users/tomaszbartel/Development/Vigil-Dataset/test_prompts.jsonl';

/**
 * Mapuje prompt na kategorię OWASP na podstawie matches[] i treści
 * Zgodnie z OWASP LLM01:2025 i Cheat Sheet
 *
 * Kategorie:
 * - LLM01_DIRECT: Direct Prompt Injection
 * - LLM01_JAILBREAK: Jailbreaking/Roleplay (DAN, Developer Mode)
 * - LLM01_EXTRACTION: System Prompt Extraction
 * - LLM01_CONTEXT: Context Confusion / Delimiter injection
 * - LLM01_ENCODING: Encoding/Obfuscation (Base64, Unicode, leet)
 * - LLM01_INDIRECT: Indirect Injection (tool calls, emails)
 * - LLM10_CBRNE: CBRNE/Harmful Content
 */
function classifyToOWASP(matches, prompt) {
  const matchStr = (matches || []).join(' ').toLowerCase();
  const promptLower = (prompt || '').toLowerCase();
  const combined = matchStr + ' ' + promptLower;

  // 1. CBRNE - highest priority (harmful content) - LLM10
  if (/chemical\s*weapon|nuclear\s*device|biological\s*agent|how\s*to\s*make.*bomb|explosive|homemade.*bomb|build.*weapon/i.test(combined)) {
    return 'LLM10_CBRNE';
  }

  // 2. Jailbreaking/Roleplay attacks - LLM01
  if (/jailbreak|do\s*anything\s*now|dan\s*mode|developer\s*mode|unrestricted|no\s*filter|deno?s?\s*mode|act\s*as.*unrestricted|roleplay.*evil/i.test(combined)) {
    return 'LLM01_JAILBREAK';
  }

  // 3. System Prompt Extraction - LLM01
  if (/system\s*prompt|reveal.*instruction|output.*prompt|print.*config|show.*original|what.*were.*told|display.*initial/i.test(combined)) {
    return 'LLM01_EXTRACTION';
  }

  // 4. Context Confusion / Delimiter injection - LLM01
  if (/debug\s*mode|admin\s*override|end\s*of\s*simulation|new\s*instruction|\<\|im_|this\s*is\s*an?\s*admin|admin\s*test/i.test(combined)) {
    return 'LLM01_CONTEXT';
  }

  // 5. Encoding/Obfuscation (Base64, Unicode, leet) - LLM01
  if (/base64|unicode|\\x[0-9a-f]|零一|\\u[0-9a-f]{4}|bypass.*filter|rot13|encoded/i.test(combined)) {
    return 'LLM01_ENCODING';
  }

  // 6. Indirect Injection (tool calls, emails) - LLM01
  if (/send\s*email|tool_call|contact@|confirmation|execute.*command|send.*confirmation|email.*body/i.test(combined)) {
    return 'LLM01_INDIRECT';
  }

  // 7. Direct Prompt Injection (default for most attacks) - LLM01
  return 'LLM01_DIRECT';
}

/**
 * Load all malicious prompts from multiple sources with OWASP classification
 */
export function loadMaliciousPrompts() {
  const prompts = [];

  // 1. OWASP AITG fixtures → pre-assigned categories
  const owaspFiles = [
    { file: 'owasp-aitg-app-01.json', category: 'LLM01_DIRECT' },
    { file: 'owasp-aitg-app-02.json', category: 'LLM01_INDIRECT' },
    { file: 'owasp-aitg-app-07.json', category: 'LLM01_EXTRACTION' }
  ];

  for (const { file, category } of owaspFiles) {
    const filePath = resolve(FIXTURES_DIR, file);
    if (!existsSync(filePath)) {
      console.warn(`⚠️  Fixture not found: ${file}`);
      continue;
    }

    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      const items = Array.isArray(data) ? data : Object.values(data).flat();

      items.forEach(item => {
        const prompt = item.payload || item.prompt || item.user_input || item;
        if (prompt && typeof prompt === 'string' && prompt.length > 3) {
          prompts.push({ prompt, category, source: file });
        }
      });
    } catch (e) {
      console.warn(`Failed to load ${file}:`, e.message);
    }
  }

  // 2. Hackaprompt sample → classify dynamically
  const hackaPath = resolve(FIXTURES_DIR, 'hackaprompt-sample.json');
  if (existsSync(hackaPath)) {
    try {
      const hacka = JSON.parse(readFileSync(hackaPath, 'utf-8'));
      hacka.forEach(item => {
        if (item.user_input && item.user_input.length > 3) {
          prompts.push({
            prompt: item.user_input,
            category: classifyToOWASP([], item.user_input),
            source: 'hackaprompt-sample.json',
            level: item.level
          });
        }
      });
    } catch (e) {
      console.warn('Failed to load hackaprompt:', e.message);
    }
  }

  // 3. Existing malicious-prompts.json → classify dynamically
  const maliciousPath = resolve(FIXTURES_DIR, 'malicious-prompts.json');
  if (existsSync(maliciousPath)) {
    try {
      const data = JSON.parse(readFileSync(maliciousPath, 'utf-8'));
      for (const [group, items] of Object.entries(data)) {
        if (Array.isArray(items)) {
          items.forEach(prompt => {
            if (prompt && typeof prompt === 'string' && prompt.length > 3) {
              prompts.push({
                prompt,
                category: classifyToOWASP([group], prompt),
                source: 'malicious-prompts.json',
                group
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load malicious-prompts.json:', e.message);
    }
  }

  // 4. External test_prompts.jsonl → classify based on matches[]
  if (existsSync(EXTERNAL_PROMPTS)) {
    try {
      const lines = readFileSync(EXTERNAL_PROMPTS, 'utf-8').split('\n').filter(l => l.trim());
      lines.forEach(line => {
        try {
          const item = JSON.parse(line);
          prompts.push({
            prompt: item.prompt,
            category: classifyToOWASP(item.matches, item.prompt),
            source: item.source || 'test_prompts.jsonl',
            matches: item.matches
          });
        } catch (e) {
          // Skip malformed lines
        }
      });
    } catch (e) {
      console.warn('Failed to load external prompts:', e.message);
    }
  } else {
    console.warn(`⚠️  External prompts not found: ${EXTERNAL_PROMPTS}`);
  }

  return prompts;
}

/**
 * Load benign prompts for FP testing
 */
export function loadBenignPrompts() {
  const prompts = [];

  const benignPath = resolve(FIXTURES_DIR, 'benign-prompts.json');
  if (!existsSync(benignPath)) {
    console.warn('⚠️  benign-prompts.json not found');
    return prompts;
  }

  try {
    const data = JSON.parse(readFileSync(benignPath, 'utf-8'));

    for (const [category, items] of Object.entries(data)) {
      if (Array.isArray(items)) {
        items.forEach(prompt => {
          prompts.push({
            prompt,
            category: 'BENIGN_FP',  // Unified OWASP-aligned category
            subcategory: category.toUpperCase(),
            source: 'benign-prompts.json',
            expected: 'ALLOWED'
          });
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load benign prompts:', e.message);
  }

  return prompts;
}

/**
 * Load PII test cases
 */
export function loadPiiTestCases() {
  return [
    { input: 'Mój PESEL to 92032100157', entities: ['PL_PESEL'], lang: 'pl' },
    { input: 'SSN: 123-45-6789', entities: ['US_SSN'], lang: 'en' },
    { input: 'Email: test@example.com', entities: ['EMAIL_ADDRESS'], lang: 'en' },
    { input: 'Credit card: 4111111111111111', entities: ['CREDIT_CARD'], lang: 'en' },
    { input: 'NIP firmy: 1234567890', entities: ['PL_NIP'], lang: 'pl' },
    { input: 'Phone: +48 123 456 789', entities: ['PHONE_NUMBER'], lang: 'pl' },
    { input: 'My IP is 192.168.1.1', entities: ['IP_ADDRESS'], lang: 'en' }
  ];
}

/**
 * Load all fixtures with OWASP category statistics
 * Note: Silent loading - stats shown in final table only
 */
export async function loadAllFixtures() {
  const malicious = loadMaliciousPrompts();
  const benign = loadBenignPrompts();
  const pii = loadPiiTestCases();

  // Silent loading - no console output during test execution
  // Stats will be shown in the final OWASP table

  return { malicious, benign, pii };
}

/**
 * Sort prompts by category for organized testing
 */
export function sortPromptsByCategory(prompts) {
  const categoryOrder = [
    'LLM01_DIRECT',
    'LLM01_JAILBREAK',
    'LLM01_EXTRACTION',
    'LLM01_CONTEXT',
    'LLM01_ENCODING',
    'LLM01_INDIRECT',
    'LLM10_CBRNE',
    'BENIGN_FP'
  ];

  return [...prompts].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a.category);
    const bIndex = categoryOrder.indexOf(b.category);

    if (aIndex === -1 && bIndex === -1) return a.category.localeCompare(b.category);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });
}
