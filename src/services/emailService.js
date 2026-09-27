import { config } from "../config.js";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

function safeProviderError(payload) {
  if (!payload || typeof payload !== "object") return "Unknown email provider error.";
  return String(payload.message || payload.error || payload.name || "Unknown email provider error.");
}

export async function sendNotificationEmail({ to, subject, text, html, replyTo }) {
  if (!config.emailNotificationsEnabled) {
    return { id: null, skipped: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.emailRequestTimeoutMs);

  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.emailFromAddress,
        to,
        subject,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail = safeProviderError(payload);
      const error = new Error(`Email provider rejected the request (${response.status}): ${detail}`);
      error.statusCode = 502;
      throw error;
    }

    return {
      id: payload?.id || null,
      skipped: false,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        `Email provider request timed out after ${config.emailRequestTimeoutMs} ms.`
      );
      timeoutError.statusCode = 502;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
