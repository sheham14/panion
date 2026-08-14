import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, type ApiErrorBody } from "@/lib/api-error";
import type { NextResponse } from "next/server";

type Ok<T> = { data: T; error: null };
type Err = { data: null; error: NextResponse<ApiErrorBody> };
export type ValidationResult<T> = Ok<T> | Err;

/**
 * Parse an already-read body against a schema.
 *
 * Returns either `{ data }` or `{ error }` — a ready-to-return 400 carrying
 * Zod's field errors in the standard envelope. Usage:
 *
 *   const { data, error } = validate(Schema, body);
 *   if (error) return error;
 */
export function validate<S extends z.ZodType>(
  schema: S,
  body: unknown,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const { fieldErrors, formErrors } = z.flattenError(result.error);
    return {
      data: null,
      error: badRequest(
        formErrors[0] ?? "Validation failed",
        fieldErrors as Record<string, string[]>,
      ),
    };
  }
  return { data: result.data, error: null };
}

/**
 * Read JSON off the request and validate it in one step.
 *
 * Malformed JSON becomes a 400 instead of an unhandled throw — several routes
 * previously let `await request.json()` reject and surface as a 500.
 */
export async function validateBody<S extends z.ZodType>(
  request: NextRequest | Request,
  schema: S,
): Promise<ValidationResult<z.output<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { data: null, error: badRequest("Invalid JSON body") };
  }
  return validate(schema, body);
}

// ── Shared field schemas ─────────────────────────────────────────────────────
// Length caps matter beyond tidiness: profile strings are interpolated into
// Clove's system prompt, so an uncapped array is both a token-cost and a
// prompt-injection surface (audit H4 + H6).

export const MAX_NAME_LENGTH = 120;
export const MAX_TAG_LENGTH = 60;
export const MAX_TAGS = 25;
export const MAX_NOTES_LENGTH = 500;

/** Trimmed, non-empty, bounded string. */
export const boundedString = (max: number) => z.string().trim().min(1).max(max);

/** A bounded list of short, deduplicated free-text tags. */
export const tagArray = z
  .array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
  .max(MAX_TAGS)
  .transform((tags) => Array.from(new Set(tags)));

/** Money: non-negative, at most 2dp, and inside the Decimal(10,2) column. */
export const priceSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(99_999_999)
  .refine((n) => Number.isInteger(Math.round(n * 100)), {
    message: "Price may have at most 2 decimal places",
  });

/** Quantity: fits Decimal(10,3). */
export const quantitySchema = z.number().finite().positive().max(9_999_999);

/** ISO date string or Date, coerced to a Date. */
export const dateSchema = z.coerce.date();

/** cuid-shaped id — loose enough to survive an id-format change. */
export const idSchema = z.string().trim().min(1).max(64);
