import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sgMail from "@sendgrid/mail";
import { redis } from "@/lib/redis";
import { validateBody } from "@/lib/validate";
import { serverError, tooManyRequests } from "@/lib/api-error";

/**
 * Server-side feedback intake.
 *
 * `/feedback` is a public page and previously sent mail straight from the
 * browser with `NEXT_PUBLIC_EMAILJS_*` keys. Those keys are, by design, in the
 * client bundle — anyone could scrape them and drain the EmailJS quota or spam
 * the inbox directly, with no captcha or rate limit in the way (audit M7).
 *
 * Moving it server-side keeps the credential out of the bundle and puts the
 * submission behind the Redis limiter the app already runs.
 */

const DAILY_IP_LIMIT = 5;

const FeedbackSchema = z.object({
  category: z.enum(["Bug report", "Feature request", "General feedback"]),
  fromName: z.string().trim().max(120).optional(),
  fromEmail: z.string().trim().email().max(254).or(z.literal("")).optional(),
  message: z.string().trim().min(1).max(4000),
});

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  // Validate before consuming quota, so a malformed body can't burn a slot.
  const { data, error } = await validateBody(request, FeedbackSchema);
  if (error) return error;

  const ip = getClientIp(request);
  const key = `feedback:ip:${ip}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 60 * 60 * 24);

  if (used > DAILY_IP_LIMIT) {
    return tooManyRequests(
      "You've sent several messages today. Please try again tomorrow.",
    );
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const to = process.env.ADMIN_EMAIL;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !to || !from) {
    console.error("[feedback] SendGrid env vars are not configured");
    return serverError("Feedback is temporarily unavailable");
  }

  sgMail.setApiKey(apiKey);

  const name = data.fromName?.trim() || "Anonymous";
  const replyTo = data.fromEmail?.trim() || null;

  try {
    await sgMail.send({
      to,
      from,
      // Lets us reply directly without trusting the address as the sender.
      ...(replyTo ? { replyTo } : {}),
      subject: `[Panion] ${data.category} from ${name}`,
      text: [
        `Category: ${data.category}`,
        `Name: ${name}`,
        `Email: ${replyTo ?? "Not provided"}`,
        "",
        data.message,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[feedback] SendGrid send failed:", err);
    return serverError("Could not send your feedback. Please try again.");
  }

  return NextResponse.json({ ok: true });
}
