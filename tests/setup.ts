import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterAll } from "vitest";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local for TEST_DATABASE_URL etc.
config({ path: resolve(__dirname, "../.env.local") });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Create a Neon branch (or point at a separate test DB) and set TEST_DATABASE_URL in .env.local. See TESTING.md for setup.",
  );
}

// Point Prisma at the test DB for the whole test process
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Stable env for predictable tests
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-not-for-prod";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-google-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "test-google-secret";

// Mock the Anthropic SDK so tests don't make external calls or burn tokens.
// A real class, not `vi.fn().mockImplementation(...)`: routes call
// `new Anthropic()`, and the mock-function form isn't constructible under
// Vitest 4 — it throws "is not a constructor" and takes whole suites with it.
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = {
      create: async () => ({
        content: [
          {
            type: "text",
            text: '{"title":"Mocked Recipe","servings":2,"ingredients":[],"instructions":[]}',
          },
        ],
        usage: { input_tokens: 50, output_tokens: 50 },
      }),
      stream: () => {
        async function* iterator() {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "mocked " },
          };
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "response" },
          };
        }
        const stream = iterator();
        return Object.assign(stream, {
          finalMessage: async () => ({
            usage: { input_tokens: 50, output_tokens: 10 },
          }),
        });
      },
    };
  }
  return { default: MockAnthropic };
});

// Mock SendGrid so signup tests don't send real email
vi.mock("@sendgrid/mail", () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn(async () => [{ statusCode: 202 }, {}]),
  },
}));

// Mock next-auth `auth()` — tests inject the session they want via setMockSession()
let mockSession: { user: { id: string; email?: string; name?: string; onboardingCompleted?: boolean } } | null = null;
export function setMockSession(session: typeof mockSession) {
  mockSession = session;
}
vi.mock("@/lib/auth-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-utils")>("@/lib/auth-utils");
  return {
    ...actual,
    getAuthenticatedUser: vi.fn(async () => {
      if (!mockSession?.user?.id) {
        const { NextResponse } = await import("next/server");
        return {
          user: null,
          error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
      }
      return {
        user: {
          id: mockSession.user.id,
          email: mockSession.user.email ?? null,
          name: mockSession.user.name ?? null,
        },
        error: null,
      };
    }),
  };
});

// Reset the mock session between tests. Rate-limit counters live in Postgres
// now and are cleared by `resetDb()` with the other tables.
beforeEach(() => {
  mockSession = null;
});

afterAll(() => {
  vi.restoreAllMocks();
});
