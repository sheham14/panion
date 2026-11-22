import sgMail from "@sendgrid/mail";

/**
 * Email the owner (ADMIN_EMAIL) about something that needs a person, such as a
 * weekly scrape that failed because a session cookie expired. Quietly does
 * nothing when email isn't configured; never throws, so a failed notice can't
 * mask the failure it reports.
 */
export async function notifyOwner(subject: string, text: string): Promise<void> {
  const { SENDGRID_API_KEY, EMAIL_FROM, ADMIN_EMAIL } = process.env;
  if (!SENDGRID_API_KEY || !EMAIL_FROM || !ADMIN_EMAIL) return;
  try {
    sgMail.setApiKey(SENDGRID_API_KEY);
    await sgMail.send({
      to: ADMIN_EMAIL,
      from: { email: EMAIL_FROM, name: "Panion" },
      subject,
      text,
    });
  } catch (err) {
    console.error("[notifyOwner] failed to send:", err);
  }
}
