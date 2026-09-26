import "dotenv/config";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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
};

if (config.openaiEmbeddingDimensions !== 1536) {
  throw new Error(
    "OPENAI_EMBEDDING_DIMENSIONS must remain 1536 because the current Supabase vector schema uses vector(1536)."
  );
}
