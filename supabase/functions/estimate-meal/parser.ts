// Ingredient parser for composite meal descriptions.
//
// DESIGN: provider-independent interface (`MealParser`) with a single OPTIONAL
// implementation (OpenAI) that is only created when OPENAI_API_KEY is present.
// When no key is configured, `createParser()` returns null and the caller falls
// back to the existing whole-query USDA search — so the feature degrades cleanly
// and manual logging / direct search are never affected.
//
// CRITICAL SAFETY RULE: the language model ONLY extracts ingredient structure
// (names, quantities, units, prep hints, uncertainty). It MUST NOT return any
// nutrition values. All calories/macros come from USDA downstream. The strict
// JSON schema below has no nutrition fields, and we validate every field.
//
// The OpenAI key is read from Deno.env inside the edge runtime only and is never
// logged or returned to the client.

/** One parsed ingredient. No nutrition values — those come from USDA later. */
export interface ParsedComponent {
  name: string;
  /** Explicit amount if stated (e.g. 2 for "2 eggs"); null when unstated. */
  quantity: number | null;
  /** Explicit unit if stated (e.g. "egg", "cup", "g"); null when unstated. */
  unit: string | null;
  /** Preparation hint (e.g. "grilled", "fried"); null when none. */
  preparation: string | null;
  /** True when the model had to assume a portion (no explicit quantity/unit). */
  assumedQuantity: boolean;
}

export interface ParsedMeal {
  /** False for a single food/dish (e.g. "macaroni and cheese"); true for a plate. */
  isComposite: boolean;
  components: ParsedComponent[];
  /** Short, human-readable caveats (ambiguity, assumptions). */
  warnings: string[];
}

export interface MealParser {
  readonly name: string;
  /** Returns a parse, or null on any failure so the caller can fall back. */
  parse(query: string): Promise<ParsedMeal | null>;
}

// Caps so a hostile/garbage description can't fan out into many USDA calls.
const MAX_COMPONENTS = 8;
const MAX_NAME_LEN = 80;
const PARSE_TIMEOUT_MS = 8000;
const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = [
  'You extract the food components of a meal description for a nutrition',
  'estimator. Respond with ONLY JSON matching the provided schema.',
  'Rules:',
  '- NEVER include nutrition values (no calories, protein, carbs, fat). You only',
  '  return ingredient names, quantities, units, preparation, and uncertainty.',
  '- Treat an established single dish as ONE component, even if its name contains',
  '  "and" or "with": e.g. "macaroni and cheese", "chicken pot pie", "fish and',
  '  chips", "peanut butter and jelly sandwich", "rice and beans" are each ONE',
  '  component. Set isComposite=false for a single food or single dish.',
  '- Only split into multiple components when the description is clearly several',
  '  distinct foods on a plate (e.g. "2 eggs and toast", "steak and broccoli").',
  '- Extract quantity and unit only when explicitly stated. If a portion is not',
  '  stated, leave quantity and unit null and set assumedQuantity=true.',
  '- Keep component names short and searchable (the noun, not a sentence).',
  '- Use warnings for ambiguity or notable assumptions. Keep them brief.',
].join('\n');

// OpenAI structured-output schema. `strict: true` forces the model to return
// exactly these fields with these types — every field is validated again below.
const JSON_SCHEMA = {
  name: 'parsed_meal',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['isComposite', 'components', 'warnings'],
    properties: {
      isComposite: { type: 'boolean' },
      warnings: { type: 'array', items: { type: 'string' } },
      components: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'quantity', 'unit', 'preparation', 'assumedQuantity'],
          properties: {
            name: { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            preparation: { type: ['string', 'null'] },
            assumedQuantity: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const;

/**
 * Returns an OpenAI-backed parser when OPENAI_API_KEY is set, otherwise null.
 * Callers MUST handle null by falling back to whole-query USDA search.
 */
export function createParser(): MealParser | null {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return null;
  }
  const model = Deno.env.get('OPENAI_MODEL') || DEFAULT_MODEL;
  return new OpenAiParser(apiKey, model);
}

class OpenAiParser implements MealParser {
  readonly name = 'openai';
  // Key/model are private and never logged.
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async parse(query: string): Promise<ParsedMeal | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          // Authorization is intentionally never logged anywhere.
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: query },
          ],
          response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Log status only — never the body, which can echo the request.
        console.error('[parser] OpenAI request failed', response.status);
        return null;
      }

      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        return null;
      }
      return validateParsedMeal(JSON.parse(content));
    } catch (err) {
      // Timeout / network / invalid JSON all fall back to whole-query search.
      console.error('[parser] parse failed', (err as Error)?.name ?? 'error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Defensive validation/coercion of the model output. Returns null if unusable. */
export function validateParsedMeal(raw: unknown): ParsedMeal | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.isComposite !== 'boolean' || !Array.isArray(obj.components)) {
    return null;
  }

  const components: ParsedComponent[] = [];
  for (const item of obj.components) {
    const component = validateComponent(item);
    if (component) {
      components.push(component);
    }
    if (components.length >= MAX_COMPONENTS) {
      break;
    }
  }

  if (components.length === 0) {
    return null;
  }

  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string').slice(0, 6)
    : [];

  return { isComposite: obj.isComposite, components, warnings };
}

function validateComponent(item: unknown): ParsedComponent | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const obj = item as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, MAX_NAME_LEN) : '';
  if (name.length === 0) {
    return null;
  }
  // Quantity must be a finite positive number to be usable; otherwise treat as
  // unstated (null + assumed) rather than trusting a bogus value.
  const quantity =
    typeof obj.quantity === 'number' && Number.isFinite(obj.quantity) && obj.quantity > 0
      ? obj.quantity
      : null;
  const unit = typeof obj.unit === 'string' && obj.unit.trim() !== ''
    ? obj.unit.trim().slice(0, 24)
    : null;
  const preparation =
    typeof obj.preparation === 'string' && obj.preparation.trim() !== ''
      ? obj.preparation.trim().slice(0, 40)
      : null;
  // If we have no concrete quantity, the portion is assumed regardless of what
  // the model claimed.
  const assumedQuantity = quantity === null ? true : obj.assumedQuantity === true;

  return { name, quantity, unit, preparation, assumedQuantity };
}
