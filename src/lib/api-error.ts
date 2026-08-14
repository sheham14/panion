import { NextResponse } from "next/server";

/**
 * Single error envelope for every API route.
 *
 * Before this existed the codebase returned three different shapes —
 * `{ error: string }`, `{ error: { fieldErrors } }`, and `{ message }` — which
 * meant clients had to guess. Everything now returns:
 *
 *   { error: { message, code?, fields? } }
 */
export type ApiErrorBody = {
  error: {
    message: string;
    code?: string;
    fields?: Record<string, string[]>;
  };
};

export function apiError(
  message: string,
  status: number,
  opts?: { code?: string; fields?: Record<string, string[]> },
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: {
        message,
        ...(opts?.code ? { code: opts.code } : {}),
        ...(opts?.fields ? { fields: opts.fields } : {}),
      },
    },
    { status },
  );
}

export const badRequest = (message = "Invalid request", fields?: Record<string, string[]>) =>
  apiError(message, 400, { code: "bad_request", fields });

export const unauthorized = (message = "Unauthorized") =>
  apiError(message, 401, { code: "unauthorized" });

export const forbidden = (message = "Forbidden") =>
  apiError(message, 403, { code: "forbidden" });

export const notFound = (message = "Not found") =>
  apiError(message, 404, { code: "not_found" });

export const conflict = (message = "Conflict") =>
  apiError(message, 409, { code: "conflict" });

export const tooManyRequests = (message = "Rate limit reached", extra?: { code?: string }) =>
  apiError(message, 429, { code: extra?.code ?? "rate_limited" });

export const serverError = (message = "Something went wrong") =>
  apiError(message, 500, { code: "server_error" });
