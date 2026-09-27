import { config } from "../config.js";
import { supabase } from "../supabase.js";
import { renderEmailSubject, renderEmailTemplate } from "../utils/emailTemplate.js";
import { sendNotificationEmail } from "./emailService.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function insertSubmission(values) {
  const { data, error } = await supabase
    .from("site_submissions")
    .insert({
      ...values,
      notification_status: config.emailNotificationsEnabled ? "pending" : "disabled",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to save site submission: ${error.message}`);
  }

  return data.id;
}

async function markNotificationSent(id) {
  const { error } = await supabase
    .from("site_submissions")
    .update({
      notification_status: "sent",
      notified_at: new Date().toISOString(),
      notification_error: null,
    })
    .eq("id", id);

  if (error) {
    console.error(`Submission ${id} email was sent, but delivery status could not be recorded:`, error);
  }
}

async function markNotificationFailed(id, error) {
  const message = String(error?.message || "Unknown email delivery error.").slice(0, 2000);

  const { error: updateError } = await supabase
    .from("site_submissions")
    .update({
      notification_status: "failed",
      notification_error: message,
    })
    .eq("id", id);

  if (updateError) {
    console.error(`Unable to record failed email delivery for submission ${id}:`, updateError);
  }
}

async function deliverSubmissionNotification(id, emailOptions) {
  if (!config.emailNotificationsEnabled) {
    return { status: "disabled" };
  }

  try {
    const result = await sendNotificationEmail(emailOptions);
    await markNotificationSent(id);
    console.log(`Site submission ${id} notification sent${result.id ? ` (${result.id})` : ""}.`);
    return { status: "sent", providerId: result.id || null };
  } catch (error) {
    await markNotificationFailed(id, error);
    console.error(`Site submission ${id} notification failed:`, error);

    // The visitor's submission is already safely stored in Supabase. Do not make the
    // form look unsuccessful just because the internal notification email failed.
    return { status: "failed" };
  }
}

function newsletterTemplateValues({ id, email, submittedAt }) {
  return {
    submissionId: id,
    email,
    submittedAt,
  };
}

function contactTemplateValues({ id, name, email, inquiryType, message, submittedAt }) {
  return {
    submissionId: id,
    name,
    email,
    inquiryType,
    message,
    submittedAt,
  };
}

export async function createNewsletterSubmission(emailValue) {
  const email = normalizeEmail(emailValue);
  if (!email || email.length > 254 || !validateEmail(email)) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  const id = await insertSubmission({
    submission_type: "newsletter",
    email,
  });

  const submittedAt = new Date().toISOString();
  const values = newsletterTemplateValues({ id, email, submittedAt });

  await deliverSubmissionNotification(id, {
    to: config.newsletterSignupToEmails,
    subject: renderEmailSubject(config.newsletterEmailSubjectTemplate, values),
    replyTo: email,
    text: renderEmailTemplate(config.newsletterEmailTextTemplate, values),
    html: renderEmailTemplate(config.newsletterEmailHtmlTemplate, values, { html: true }),
  });

  return { id };
}

export async function createContactSubmission(input = {}) {
  const name = String(input.name || "").trim();
  const email = normalizeEmail(input.email);
  const inquiryType = String(input.inquiryType || "General").trim();
  const message = String(input.message || "").trim();

  if (!name || name.length > 120) {
    const error = new Error("Name is required and must be 120 characters or fewer.");
    error.statusCode = 400;
    throw error;
  }

  if (!email || email.length > 254 || !validateEmail(email)) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!["General", "Partnership", "Media", "School"].includes(inquiryType)) {
    const error = new Error("Invalid inquiry type.");
    error.statusCode = 400;
    throw error;
  }

  if (!message || message.length > 5000) {
    const error = new Error("Message is required and must be 5000 characters or fewer.");
    error.statusCode = 400;
    throw error;
  }

  const id = await insertSubmission({
    submission_type: "contact",
    name,
    email,
    inquiry_type: inquiryType,
    message,
  });

  const submittedAt = new Date().toISOString();
  const values = contactTemplateValues({
    id,
    name,
    email,
    inquiryType,
    message,
    submittedAt,
  });

  await deliverSubmissionNotification(id, {
    to: config.contactFormToEmails,
    subject: renderEmailSubject(config.contactEmailSubjectTemplate, values),
    replyTo: email,
    text: renderEmailTemplate(config.contactEmailTextTemplate, values),
    html: renderEmailTemplate(config.contactEmailHtmlTemplate, values, { html: true }),
  });

  return { id };
}
