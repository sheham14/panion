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
process.env.UPSTASH_REDIS_REST_URL = "http://localhost"; // mocked
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";    // mocked

// In-memory Redis mock — replaces @upstash/redis for tests
const redisStore = new Map<string, string>();
const redisTtl = new Map<string, number>();
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    incr: vi.fn(async (key: string) => {
      const next = (parseInt(redisStore.get(key) ?? "0", 10) + 1).toString();
      redisStore.set(key, next);
      return parseInt(next, 10);
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      redisTtl.set(key, Date.now() + seconds * 1000);
      return 1;
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
  })),
}));

// Mock the Anthropic SDK so tests don't make external calls or burn tokens
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: '{"title":"Mocked Recipe","servings":2,"ingredients":[],"instructions":[]}' }],
        usage: { input_tokens: 50, output_tokens: 50 },
      })),
      stream: vi.fn(() => {
        async function* iterator() {
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "mocked " } };
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "response" } };
        }
        const stream = iterator();
        return Object.assign(stream, {
          finalMessage: async () => ({ usage: { input_tokens: 50, output_tokens: 10 } }),
        });
      }),
    },
  }));
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

// Reset Redis store + mock session between tests
beforeEach(() => {
  redisStore.clear();
  redisTtl.clear();
  mockSession = null;
});

afterAll(() => {
  vi.restoreAllMocks();
});
