import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:" + (process.env.EMAIL_FROM ?? "admin@example.com"),
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
) {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
}
