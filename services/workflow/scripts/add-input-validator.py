#!/usr/bin/env python3
"""
Add Input_Validator node to Vigil-Guard workflow (Phase 2.4)
This script modifies the workflow JSON to insert input validation before PII_Redactor
"""

import json
import sys
from uuid import uuid4

def generate_uuid():
    """Generate a UUID4 string"""
    return str(uuid4())

def create_input_validator_node():
    """Create the Input_Validator Code node"""
    return {
        "parameters": {
            "jsCode": '''/**
 * Input_Validator - Pre-filtering DoS Protection (Phase 2.4)
 * Validates input before main pipeline to prevent resource exhaustion
 */

const items = $input.all();
if (!items || items.length === 0) {
  console.warn('Input_Validator: No input items');
  return [];
}

const out = [];

for (const item of items) {
  const j = item.json ?? {};

  // Skip if config error already present
  if (j.configError === true) {
    j.validation = { passed: false, reason: 'CONFIG_ERROR' };
    item.json = j;
    out.push(item);
    continue;
  }

  // Get input text
  const text = j.chat_payload?.chatInput ?? j.chatInput ?? "";

  // Initialize validation result
  const validation = {
    passed: true,
    reason: null,
    checks: {},
    input_length: text.length
  };

  // CHECK 1: Minimum length (empty input)
  if (text.length < 1) {
    validation.passed = false;
    validation.reason = 'EMPTY_INPUT';
    validation.checks.min_length = false;

    j._isBlocked = true;
    j.decision = {
      decision: 'BLOCK',
      source: 'input_validator',
      reason: 'EMPTY_INPUT',
      updated_at: new Date().toISOString()
    };
    j.score = 100;
    j.scoreBreakdown = { INPUT_VALIDATION: 100 };
  }
  // CHECK 2: Maximum length (DoS protection)
  else if (text.length > 10000) {
    validation.passed = false;
    validation.reason = 'EXCESSIVE_LENGTH';
    validation.checks.max_length = false;

    j._isBlocked = true;
    j.decision = {
      decision: 'BLOCK',
      source: 'input_validator',
      reason: 'EXCESSIVE_LENGTH',
      updated_at: new Date().toISOString()
    };
    j.score = 100;
    j.scoreBreakdown = { INPUT_VALIDATION: 100 };
  }
  // CHECK 3: Excessive control characters (>30%)
  else {
    const controlChars = (text.match(/[\\x00-\\x1F\\x7F-\\x9F]/g) || []).length;
    const controlRatio = text.length > 0 ? controlChars / text.length : 0;

    if (controlRatio > 0.30) {
      validation.passed = false;
      validation.reason = 'EXCESSIVE_CONTROL_CHARS';
      validation.checks.control_chars = false;
      validation.checks.control_ratio = controlRatio;

      j._isBlocked = true;
      j.decision = {
        decision: 'BLOCK',
        source: 'input_validator',
        reason: 'EXCESSIVE_CONTROL_CHARS',
        updated_at: new Date().toISOString()
      };
      j.score = 100;
      j.scoreBreakdown = { INPUT_VALIDATION: 100 };
    }
    // CHECK 4: Excessive repetition (uniqueChars < 5 for >100 char inputs)
    else if (text.length > 100) {
      const uniqueChars = new Set(text).size;

      if (uniqueChars < 5) {
        validation.passed = false;
        validation.reason = 'EXCESSIVE_REPETITION';
        validation.checks.unique_chars = uniqueChars;
        validation.checks.repetition_detected = true;

        j._isBlocked = true;
        j.decision = {
          decision: 'BLOCK',
          source: 'input_validator',
          reason: 'EXCESSIVE_REPETITION',
          updated_at: new Date().toISOString()
        };
        j.score = 100;
        j.scoreBreakdown = { INPUT_VALIDATION: 100 };
      } else {
        validation.checks.unique_chars = uniqueChars;
        validation.checks.repetition_detected = false;
      }
    }

    // Mark all checks passed if no failures
    if (validation.passed) {
      validation.checks.min_length = true;
      validation.checks.max_length = true;
      validation.checks.control_chars = true;
      validation.checks.repetition_detected = false;
    }
  }

  // Store validation result
  j.validation = validation;
  j._input_validated = true;

  item.json = j;
  out.push(item);
}

return out;'''
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [-3360, -16],
        "id": generate_uuid(),
        "name": "Input_Validator"
    }

def create_validation_if_node():
    """Create the IF node to check validation.passed"""
    return {
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "loose",
                    "version": 2
                },
                "conditions": [
                    {
                        "id": generate_uuid(),
                        "leftValue": "={{ $json.validation?.passed }}",
                        "rightValue": True,
                        "operator": {
                            "type": "boolean",
                            "operation": "true"
                        }
                    }
                ],
                "combinator": "and"
            },
            "looseTypeValidation": True,
            "options": {}
        },
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [-3200, -16],
        "id": generate_uuid(),
        "name": "Validation Check"
    }

def create_early_block_response_node():
    """Create early block response node"""
    return {
        "parameters": {
            "jsCode": '''/**
 * Early Block Response - Validation failure handler
 */

const items = $input.all();
const out = [];

for (const item of items) {
  const j = item.json ?? {};
  const validation = j.validation || {};

  // Get block message from config or use default
  const config = j.config || {};
  const defaultMessage = config.enforcement?.block_message || "Content blocked by security policy";

  // Create specific message based on validation failure reason
  let blockMessage = defaultMessage;
  switch (validation.reason) {
    case 'EMPTY_INPUT':
      blockMessage = "Invalid request: Empty input";
      break;
    case 'EXCESSIVE_LENGTH':
      blockMessage = "Invalid request: Input exceeds maximum length (10000 characters)";
      break;
    case 'EXCESSIVE_CONTROL_CHARS':
      blockMessage = "Invalid request: Excessive control characters detected";
      break;
    case 'EXCESSIVE_REPETITION':
      blockMessage = "Invalid request: Excessive character repetition detected";
      break;
  }

  // Set output text
  j.output_text = blockMessage;

  // Ensure decision is set
  if (!j.decision) {
    j.decision = {
      decision: 'BLOCK',
      source: 'input_validator',
      reason: validation.reason || 'VALIDATION_FAILED',
      updated_at: new Date().toISOString()
    };
  }

  // Set chat_payload for output
  j.chat_payload = j.chat_payload || {};
  j.chat_payload.chatInput = blockMessage;

  item.json = j;
  out.push(item);
}

return out;'''
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [-3040, 96],
        "id": generate_uuid(),
        "name": "Early Block Response"
    }

def create_merge_validation_node():
    """Create merge node to combine validation paths"""
    return {
        "parameters": {
            "mode": "combine",
            "combineBy": "combineByPosition",
            "options": {
                "includeUnpaired": True
            }
        },
        "type": "n8n-nodes-base.merge",
        "typeVersion": 3.2,
        "position": [-2880, -16],
        "id": generate_uuid(),
        "name": "Merge Validation"
    }

def modify_workflow(workflow_path):
    """Modify the workflow JSON to add Input_Validator"""

    print(f"Reading workflow from: {workflow_path}")
    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    # Create new nodes
    input_validator = create_input_validator_node()
    validation_if = create_validation_if_node()
    early_block = create_early_block_response_node()
    merge_validation = create_merge_validation_node()

    # Add nodes to workflow
    workflow['nodes'].extend([
        input_validator,
        validation_if,
        early_block,
        merge_validation
    ])

    # Update connections
    # 1. Config Loader -> Input_Validator (instead of PII_Redactor)
    workflow['connections']['Config Loader'] = {
        "main": [[{
            "node": "Input_Validator",
            "type": "main",
            "index": 0
        }]]
    }

    # 2. Input_Validator -> Validation Check
    workflow['connections']['Input_Validator'] = {
        "main": [[{
            "node": "Validation Check",
            "type": "main",
            "index": 0
        }]]
    }

    # 3. Validation Check (true) -> PII_Redactor
    #    Validation Check (false) -> Early Block Response
    workflow['connections']['Validation Check'] = {
        "main": [
            [{
                "node": "PII_Redactor",
                "type": "main",
                "index": 0
            }],
            [{
                "node": "Early Block Response",
                "type": "main",
                "index": 0
            }]
        ]
    }

    # 4. Early Block Response -> Merge Validation
    workflow['connections']['Early Block Response'] = {
        "main": [[{
            "node": "Merge Validation",
            "type": "main",
            "index": 1
        }]]
    }

    # 5. PII_Redactor -> Merge Validation (in addition to Normalize_Node)
    # We need to insert Merge Validation between validation paths and rest of pipeline
    # Actually, let's keep PII_Redactor -> Normalize_Node unchanged
    # And merge validation results before Normalize_Node

    # Better approach: Early Block Response goes directly to Build+Sanitize NDJSON
    # Let's revise: early blocks skip the entire pipeline

    # Update: Early Block Response -> Build+Sanitize NDJSON (skip pipeline)
    workflow['connections']['Early Block Response'] = {
        "main": [[{
            "node": "Build+Sanitize NDJSON",
            "type": "main",
            "index": 0
        }]]
    }

    print(f"Added nodes: Input_Validator, Validation Check, Early Block Response")
    print(f"Updated connections: Config Loader -> Input_Validator -> Validation Check")
    print(f"  - Validation passed: -> PII_Redactor (existing pipeline)")
    print(f"  - Validation failed: -> Early Block Response -> Build+Sanitize NDJSON")

    # Save modified workflow
    output_path = workflow_path
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)

    print(f"Workflow saved to: {output_path}")
    return True

if __name__ == "__main__":
    workflow_path = "/Users/tomaszbartel/Documents/Projects/Vigil-Guard/services/workflow/workflows/Vigil-Guard-v1.0.json"

    try:
        modify_workflow(workflow_path)
        print("✅ Phase 2.4 implementation complete")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
