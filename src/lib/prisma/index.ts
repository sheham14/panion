import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
// 1. Import directly from your newly generated folder
import { PrismaClient } from "../../../prisma/generated/client";

// 2. Initialize the Prisma 7 database adapter
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// 3. Keep your global Next.js cache setup to prevent connection limits
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter, // <-- Pass the adapter into the client here
    // Logging every query in production is noisy, slows requests, and can spill
    // data values into Vercel's log stream (audit M8).
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
