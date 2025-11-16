# Backend Type Definitions

## Overview

This directory contains TypeScript type definitions for the Vigil Guard backend API. These types provide compile-time type safety, better IDE support, and prevent common runtime errors.

## Files

- **pii.ts** - PII detection system types (entities, validation, analysis results)

## Key Features

### 1. Branded Types

Branded types prevent accidental string assignments:

```typescript
import { PresidioEntityType } from './types/pii.js';

// ✅ OK - known entity type
const entityType: PresidioEntityType = "EMAIL_ADDRESS";

// ❌ Compile error - typo caught at build time
const entityType: PresidioEntityType = "EMAIL_ADRESS";

// ❌ Compile error - unknown entity type
const entityType: PresidioEntityType = "CUSTOM_TYPE";
```

**Benefits:**
- Catches typos at compile time (not runtime)
- IDE autocomplete shows all valid entity types
- Zero runtime overhead (brand erased at compile)

### 2. Discriminated Unions

Discriminated unions enable exhaustive pattern matching:

```typescript
import { PresidioEntity, isPresidioEntity, isRegexEntity } from './types/pii.js';

function processEntity(entity: PresidioEntity) {
  if (isPresidioEntity(entity)) {
    // TypeScript knows: entity.score exists, entity.source_language is "pl" | "en"
    console.log(`Presidio entity: ${entity.entity_type} (score: ${entity.score})`);
  } else if (isRegexEntity(entity)) {
    // TypeScript knows: entity.pattern_name exists, entity.score is always 1.0
    console.log(`Regex entity: ${entity.entity_type} (pattern: ${entity.pattern_name})`);
  } else {
    // TypeScript knows: this must be fallback entity
    console.log(`Fallback entity: ${entity.entity_type} (confidence: ${entity.confidence})`);
  }
}
```

**Benefits:**
- Compile-time exhaustiveness checking (all cases handled)
- Type narrowing (TypeScript knows which fields exist after guard)
- No runtime type errors (e.g., accessing undefined fields)

### 3. Type Guards

Type guards enable safe runtime type checking:

```typescript
import { PresidioEntity, isPresidioEntity } from './types/pii.js';

const entities: PresidioEntity[] = [...];

// Filter to only Presidio entities (type-safe)
const presidioEntities = entities.filter(isPresidioEntity);
// TypeScript knows: presidioEntities has type Extract<PresidioEntity, { source: "presidio" }>[]

// Access Presidio-specific fields safely
presidioEntities.forEach(entity => {
  console.log(entity.score); // ✅ OK - score exists on Presidio entities
  console.log(entity.pattern_name); // ❌ Compile error - pattern_name only on regex entities
});
```

**Benefits:**
- Type narrowing in filter/map operations
- Prevents accessing fields that don't exist
- Self-documenting code (guard name indicates what's being checked)

## Usage Examples

### Example 1: Entity Type Validation

```typescript
import { PresidioEntityType, KNOWN_ENTITY_TYPES } from './types/pii.js';

function validateEntityTypes(userInput: string[]): {
  valid: PresidioEntityType[];
  invalid: string[];
} {
  const valid: PresidioEntityType[] = [];
  const invalid: string[] = [];

  for (const entity of userInput) {
    if (KNOWN_ENTITY_TYPES.includes(entity as any)) {
      valid.push(entity as PresidioEntityType);
    } else {
      invalid.push(entity);
    }
  }

  return { valid, invalid };
}
```

### Example 2: Building Analysis Result

```typescript
import { DualAnalyzeResult, PresidioEntity, LanguageStats } from './types/pii.js';

async function analyzePII(text: string): Promise<DualAnalyzeResult> {
  const entities: PresidioEntity[] = await detectEntities(text);
  const languageStats: LanguageStats = await buildStats(entities);

  return {
    entities,
    detection_method: "presidio_dual_language",
    processing_time_ms: 123,
    redacted_text: applyRedactions(text, entities),
    language_stats: languageStats,
    detection_complete: true
  };
}
```

### Example 3: Pattern Matching with Discriminated Unions

```typescript
import { PresidioEntity } from './types/pii.js';

function getEntityConfidence(entity: PresidioEntity): number {
  switch (entity.source) {
    case 'presidio':
      return entity.score; // TypeScript knows: score exists
    case 'regex':
      return 1.0; // Regex always has 100% confidence
    case 'fallback':
      return entity.confidence; // TypeScript knows: confidence exists
    default:
      // TypeScript ensures this is unreachable (all cases handled)
      const _exhaustive: never = entity;
      throw new Error(`Unhandled entity source: ${(entity as any).source}`);
  }
}
```

## Type Safety Benefits

### Before (Plain JavaScript/any types)

```typescript
// ❌ No compile-time checking
const entityType = "EMAIL_ADRESS"; // Typo not caught
const entities: any[] = await callPresidio();

entities.forEach(entity => {
  console.log(entity.scor); // Typo not caught (undefined at runtime)
  if (entity.source === 'presidio') {
    console.log(entity.pattern_name); // Wrong field accessed (undefined)
  }
});
```

### After (Typed system)

```typescript
// ✅ Compile-time type safety
const entityType: PresidioEntityType = "EMAIL_ADRESS"; // ❌ Compile error
const entities: PresidioEntity[] = await callPresidio();

entities.forEach(entity => {
  console.log(entity.scor); // ❌ Compile error (field doesn't exist)
  if (isPresidioEntity(entity)) {
    console.log(entity.pattern_name); // ❌ Compile error (not on Presidio entities)
    console.log(entity.score); // ✅ OK
  }
});
```

## Adding New Entity Types

When adding a new Presidio recognizer:

1. **Update KNOWN_ENTITY_TYPES array** in `pii.ts`:
   ```typescript
   export const KNOWN_ENTITY_TYPES = [
     // ... existing types ...
     "NEW_ENTITY_TYPE", // Add here
   ] as const;
   ```

2. **TypeScript will automatically**:
   - Add to `PresidioEntityType` union
   - Enable in IDE autocomplete
   - Validate all existing usages

3. **No other changes needed** - all existing code continues to work!

## Migration Notes

### Existing Code Compatibility

The type system is **backward compatible** with existing code:

- Existing `PresidioEntityType` type alias still works (points to branded type)
- Existing interfaces (`LanguageStats`, `PiiConfig`, etc.) unchanged
- No breaking changes to function signatures

### Gradual Adoption

You can adopt types gradually:

1. **Start using type guards** in new code (`isPresidioEntity`, etc.)
2. **Replace `any` with `PresidioEntity`** when refactoring
3. **Use branded types** for new entity type parameters
4. **Add discriminated union handling** for better error messages

## Testing

### Type-Only Tests (Compile-Time)

```typescript
// This file doesn't run - just checks types compile
import { PresidioEntity, isPresidioEntity } from './types/pii.js';

// ✅ Valid assignments
const presidioEntity: PresidioEntity = {
  source: 'presidio',
  entity_type: 'EMAIL_ADDRESS',
  start: 0,
  end: 10,
  score: 0.95,
  source_language: 'en'
};

// ❌ Invalid assignment (missing required field)
const invalidEntity: PresidioEntity = {
  source: 'presidio',
  entity_type: 'EMAIL_ADDRESS',
  // Missing: start, end, score, source_language
};

// ✅ Type guard narrows type
if (isPresidioEntity(presidioEntity)) {
  const score: number = presidioEntity.score; // OK
}
```

### Runtime Tests (Vitest/Jest)

```typescript
import { describe, it, expect } from 'vitest';
import { isPresidioEntity, isRegexEntity } from './types/pii.js';

describe('PII Type Guards', () => {
  it('should identify Presidio entities', () => {
    const entity = {
      source: 'presidio',
      entity_type: 'EMAIL_ADDRESS',
      start: 0,
      end: 10,
      score: 0.95,
      source_language: 'en'
    };

    expect(isPresidioEntity(entity)).toBe(true);
    expect(isRegexEntity(entity)).toBe(false);
  });
});
```

## Performance

**Type system has ZERO runtime overhead:**
- Branded types erased at compile (no runtime objects)
- Type guards are simple property checks (same as manual `if` statements)
- Discriminated unions use native JavaScript property access

**Compile-time cost:**
- Minimal (types add ~100ms to `tsc` build)
- Type-checking happens in IDE background (no impact on dev server)

## References

- [TypeScript Branded Types](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
- [Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)

---

**Last Updated:** 2025-11-16
**TypeScript Version:** 5.5.4
**Maintained By:** Vigil Guard Backend Team
