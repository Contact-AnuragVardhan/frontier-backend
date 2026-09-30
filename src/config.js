import "dotenv/config";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value ? value.trim() : null;
}

function requireOneOf(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable. Set one of: ${names.join(", ")}`);
}

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function numberInRange(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

function booleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;

  const normalized = String(raw).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  throw new Error(`${name} must be true or false.`);
}


function templateEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;

  // This allows Render/.env values such as "Line 1\\nLine 2" to become a
  // real multiline text template while still supporting true multiline values.
  return raw
    .replaceAll("\\r\\n", "\r\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", "\t");
}

function emailList(name, required = false) {
  const raw = process.env[name];
  if (!raw) {
    if (required) throw new Error(`Missing required environment variable: ${name}`);
    return [];
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (required && values.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return values;
}

const emailNotificationsEnabled = booleanEnv("EMAIL_NOTIFICATIONS_ENABLED", true);

export const config = {
  port: Number(process.env.PORT || 4000),

  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requireOneOf([
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]),

  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  openaiEmbeddingModel:
    process.env.OPENAI_EMBEDDING_MODEL ||
    process.env.OPENAI_EMEDDING_MODEL ||
    "text-embedding-3-small",
  openaiEmbeddingDimensions: positiveInteger("OPENAI_EMBEDDING_DIMENSIONS", 1536),
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna",
  openaiQueryModel:
    process.env.OPENAI_QUERY_MODEL ||
    process.env.OPENAI_CHAT_MODEL ||
    "gpt-5.6-luna",
  openaiTimeoutMs: positiveInteger("OPENAI_TIMEOUT_MS", 90000),

  knowledgeSourceKey: process.env.KNOWLEDGE_SOURCE_KEY?.trim() || null,
  retrievalMatchCount: positiveInteger("RETRIEVAL_MATCH_COUNT", 6),
  retrievalMatchThreshold: numberInRange("RETRIEVAL_MATCH_THRESHOLD", 0.35, 0, 1),
  retrievalQueryCount: positiveInteger("RETRIEVAL_QUERY_COUNT", 3),
  ragMaxContextChars: positiveInteger("RAG_MAX_CONTEXT_CHARS", 32000),

  chatHistoryMaxMessages: nonNegativeInteger("CHAT_HISTORY_MAX_MESSAGES", 8),
  chatHistoryMaxChars: nonNegativeInteger("CHAT_HISTORY_MAX_CHARS", 6000),

  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

  emailNotificationsEnabled,
  resendApiKey: emailNotificationsEnabled ? requireEnv("RESEND_API_KEY") : optionalEnv("RESEND_API_KEY"),
  emailFromAddress: emailNotificationsEnabled
    ? requireEnv("EMAIL_FROM_ADDRESS")
    : optionalEnv("EMAIL_FROM_ADDRESS"),
  emailRequestTimeoutMs: positiveInteger("EMAIL_REQUEST_TIMEOUT_MS", 15000),

  // Each form/screen has its own recipient environment variable so the destination
  // can be changed independently without a code deployment.
  contactFormToEmails: emailList("CONTACT_FORM_TO_EMAIL", emailNotificationsEnabled),
  newsletterSignupToEmails: emailList("NEWSLETTER_SIGNUP_TO_EMAIL", emailNotificationsEnabled),
  parentChapterToEmails: emailList("PARENT_CHAPTER_TO_EMAIL", emailNotificationsEnabled),

  // Each form also has independent subject/text/HTML templates. Values from environment
  // variables override these safe defaults. Dynamic values use {{placeholder}} syntax.
  contactEmailSubjectTemplate: templateEnv(
    "CONTACT_EMAIL_SUBJECT_TEMPLATE",
    "[AI Choice] New {{inquiryType}} contact inquiry"
  ),
  contactEmailTextTemplate: templateEnv(
    "CONTACT_EMAIL_TEXT_TEMPLATE",
    "A new contact request was submitted on the AI Choice website.\n\nName: {{name}}\nEmail: {{email}}\nInquiry type: {{inquiryType}}\nSubmitted: {{submittedAt}}\nSubmission ID: {{submissionId}}\n\nMessage:\n{{message}}"
  ),
  contactEmailHtmlTemplate: templateEnv(
    "CONTACT_EMAIL_HTML_TEMPLATE",
    "<h2>New AI Choice contact inquiry</h2><table cellpadding=\"6\" cellspacing=\"0\" border=\"0\"><tr><td><strong>Name</strong></td><td>{{name}}</td></tr><tr><td><strong>Email</strong></td><td>{{email}}</td></tr><tr><td><strong>Inquiry type</strong></td><td>{{inquiryType}}</td></tr><tr><td><strong>Submitted</strong></td><td>{{submittedAt}}</td></tr><tr><td><strong>Submission ID</strong></td><td>{{submissionId}}</td></tr></table><h3>Message</h3><p style=\"white-space:pre-wrap\">{{message}}</p>"
  ),

  parentChapterEmailSubjectTemplate: templateEnv(
    "PARENT_CHAPTER_EMAIL_SUBJECT_TEMPLATE",
    "[AI Choice] New Parent Chapter Request"
  ),
  parentChapterEmailTextTemplate: templateEnv(
    "PARENT_CHAPTER_EMAIL_TEXT_TEMPLATE",
    "New Parent Chapter Request\n\nFull name: {{fullName}}\nEmail: {{email}}\nCity and state: {{cityState}}\nSchool or school district: {{schoolDistrict}}\nMailing address: {{mailingAddress}}\nSubmitted: {{submittedAt}}\nSubmission ID: {{submissionId}}"
  ),
  parentChapterEmailHtmlTemplate: templateEnv(
    "PARENT_CHAPTER_EMAIL_HTML_TEMPLATE",
    "<h2>New Parent Chapter Request</h2><table cellpadding=\"6\" cellspacing=\"0\" border=\"0\"><tr><td><strong>Full name</strong></td><td>{{fullName}}</td></tr><tr><td><strong>Email</strong></td><td>{{email}}</td></tr><tr><td><strong>City and state</strong></td><td>{{cityState}}</td></tr><tr><td><strong>School or school district</strong></td><td>{{schoolDistrict}}</td></tr><tr><td><strong>Mailing address</strong></td><td style=\"white-space:pre-wrap\">{{mailingAddress}}</td></tr><tr><td><strong>Submitted</strong></td><td>{{submittedAt}}</td></tr><tr><td><strong>Submission ID</strong></td><td>{{submissionId}}</td></tr></table>"
  ),

  newsletterEmailSubjectTemplate: templateEnv(
    "NEWSLETTER_EMAIL_SUBJECT_TEMPLATE",
    "[AI Choice] New newsletter signup"
  ),
  newsletterEmailTextTemplate: templateEnv(
    "NEWSLETTER_EMAIL_TEXT_TEMPLATE",
    "A new visitor signed up for AI Choice Brief.\n\nEmail: {{email}}\nSubmitted: {{submittedAt}}\nSubmission ID: {{submissionId}}"
  ),
  newsletterEmailHtmlTemplate: templateEnv(
    "NEWSLETTER_EMAIL_HTML_TEMPLATE",
    "<h2>New AI Choice Brief signup</h2><p>A new visitor signed up for AI Choice Brief.</p><table cellpadding=\"6\" cellspacing=\"0\" border=\"0\"><tr><td><strong>Email</strong></td><td>{{email}}</td></tr><tr><td><strong>Submitted</strong></td><td>{{submittedAt}}</td></tr><tr><td><strong>Submission ID</strong></td><td>{{submissionId}}</td></tr></table>"
  ),
};

if (config.openaiEmbeddingDimensions !== 1536) {
  throw new Error(
    "OPENAI_EMBEDDING_DIMENSIONS must remain 1536 because the current Supabase vector schema uses vector(1536)."
  );
}
