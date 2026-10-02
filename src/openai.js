import { config } from "./config.js";

async function openAiRequest(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.openaiTimeoutMs);

  try {
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        payload?.error?.message ||
        `OpenAI request failed with status ${response.status}.`;
      throw new Error(detail);
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `OpenAI request timed out after ${config.openaiTimeoutMs} ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createEmbeddings(texts) {
  const inputs = (Array.isArray(texts) ? texts : [])
    .map((text) => String(text || "").trim())
    .filter(Boolean);

  if (inputs.length === 0) return [];

  const payload = await openAiRequest("/embeddings", {
    model: config.openaiEmbeddingModel,
    input: inputs,
    dimensions: config.openaiEmbeddingDimensions,
  });

  const rows = Array.isArray(payload?.data)
    ? [...payload.data].sort(
        (a, b) => Number(a?.index || 0) - Number(b?.index || 0),
      )
    : [];

  if (rows.length !== inputs.length) {
    throw new Error(
      `OpenAI embeddings response returned ${rows.length} embeddings for ${inputs.length} inputs.`,
    );
  }

  return rows.map((row) => {
    const embedding = row?.embedding;

    if (!Array.isArray(embedding)) {
      throw new Error(
        "OpenAI embeddings response did not contain an embedding.",
      );
    }

    if (embedding.length !== config.openaiEmbeddingDimensions) {
      throw new Error(
        `Unexpected embedding size ${embedding.length}; expected ${config.openaiEmbeddingDimensions}.`,
      );
    }

    return embedding;
  });
}

export async function createEmbedding(text) {
  const embeddings = await createEmbeddings([text]);
  return embeddings[0];
}

function extractResponseText(payload) {
  const parts = [];

  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;

    for (const content of item.content || []) {
      if (
        content?.type === "output_text" &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "(none)";

  return history
    .map(
      (entry) =>
        `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`,
    )
    .join("\n");
}

function uniqueStrings(values, maxCount) {
  const seen = new Set();
  const result = [];

  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(value);

    if (result.length >= maxCount) break;
  }

  return result;
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("OpenAI response was not valid JSON.");
  }
}

function normalizeIntent(value) {
  if (value === "conversation") return "conversation";
  if (value === "policy") return "policy";
  if (value === "knowledge_and_policy") return "knowledge_and_policy";
  if (value === "out_of_scope") return "out_of_scope";
  return "knowledge";
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePolicyQuery(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    state: optionalString(source.state),
    category: optionalString(source.category),
    status: optionalString(source.status),
    policyIdentifier: optionalString(source.policyIdentifier),
    searchText: optionalString(source.searchText),
  };
}

export async function createRetrievalPlan({ question, history = [] }) {
  const instructions = `
You are the turn router and retrieval planner for the AI Choice website chatbot.

You are NOT the factual answering model.

Your job is to:
1. classify the user's current turn,
2. resolve conversational follow-ups into a standalone question,
3. create vector-search queries when approved AI Choice/SETDA knowledge is needed,
4. extract structured policy filters when AI Choice Map policy data is needed,
5. produce a direct reply only when retrieval is not needed.

SITE CONTEXT
- The chatbot is part of the AI Choice website at aichoice.org.
- There are TWO factual data sources available to the answering system:
  A) APPROVED KNOWLEDGE: AI Choice organization content and approved document knowledge such as SETDA, retrieved by semantic/vector search.
  B) AI CHOICE MAP POLICY DATA: normalized structured state policy rows stored in the same policies table used by the AI Choice Map.
- Some approved organization source material was created under the former public name Frontier Education Project. Treat references to Frontier Education Project in those approved sources as references to AI Choice for public-facing wording, without inventing new facts.
- In a vague site-level question, words such as "this", "this site", "this project", "this organization", "you", or "your organization" normally refer to AI Choice unless recent conversation clearly establishes another referent.
- Use recent conversation to resolve pronouns and follow-ups such as "it", "that", "they", "what about California?", "what is the source for that policy?", "how often", "why", "tell me more", and similar shorthand.

INTENT VALUES

"conversation"
- Greetings, thanks, acknowledgements, closings, or simple social turns that need no factual retrieval.
- Provide a short natural directResponse.

"knowledge"
- AI Choice organization/content/document questions that should be answered from approved vector/RAG knowledge.
- Examples: "What is AI Choice?", "Who founded AI Choice?", "What are Parent Chapters?", "What does SETDA say about AI?"
- Produce 1 to ${config.retrievalQueryCount} useful semantic-search queries.

"policy"
- Questions whose factual answer should come from the structured AI Choice Map policies table.
- This includes questions about states, bills/laws/guidance, policy categories, policy status, policy identifiers, effective dates, implementation timelines, official policy sources, research provenance, or what policies are listed in the map.
- Examples: "What policies does New Jersey have?", "Which states have AI Literacy policies?", "What is the status of SB 1227?", "What is the official source for this policy?", "What school choice policies does Arizona have?"
- Map/policy questions MUST NOT be classified as out_of_scope merely because the requested category or policy might not exist yet.
- queries must be [] unless knowledge retrieval is also needed.

"knowledge_and_policy"
- A single user turn requires BOTH approved organization/document knowledge and structured map policy data.
- Example: "What does AI Choice do and what policies does New Jersey have?"
- Produce semantic-search queries for the knowledge portion AND a policyQuery for the policy portion.

"out_of_scope"
- Unrelated general knowledge, personal information the chatbot does not have, or a task unrelated to both approved AI Choice knowledge and AI Choice Map policy data.
- Provide a brief directResponse and do not answer from outside knowledge.

POLICY QUERY EXTRACTION
For "policy" and "knowledge_and_policy", populate policyQuery using ONLY filters actually implied by the user's current turn plus recent conversation needed to resolve follow-ups.

Supported fields:
- state: state name or two-letter state code when clearly requested.
- category: normalized policy category/topic requested by the user. Do NOT restrict this to a hardcoded list; preserve whatever named category/topic the user actually asks for.
- status: requested high-level policy status such as Active, Pending, Enacted, etc.
- policyIdentifier: bill/law/policy identifier such as "SB 1227" when requested.
- searchText: optional title/search phrase only when it is genuinely useful and no more specific extracted field represents the phrase.

POLICY EXTRACTION RULES
- Do not invent filters.
- Do not hardcode or reason about individual research-source names; retrieval works from normalized policy rows regardless of provenance.
- The policy table is already normalized; source-specific ingestion details are not your concern.
- Prefer category for a named policy topic/category and policyIdentifier for a bill/law identifier.
- Generic phrases such as "AI education policies", "state policies", "map policies", or simply "policies" describe the policy collection and should NOT become a category filter by themselves.
- If the user says "What policies does New Jersey have?", use state="New Jersey" and leave other fields null.
- If the user asks "Which states have <named policy category>?", use that named category as the category filter.
- If the user says "What is the status of Idaho SB 1227?", use state="Idaho" and policyIdentifier="SB 1227".
- If the user says "What active Student Privacy policies does California have?", use state="California", category="Student Privacy", status="Active".
- For a follow-up like "What about California?" after asking about New Jersey policies, resolve the standalone question to California policies and use state="California".
- For a follow-up like "What is the source for that policy?", carry forward the specific policy identifier/state from recent conversation when clearly established.

KNOWLEDGE PLANNING RULES
- Preserve the user's actual intent.
- Resolve references so standaloneQuestion can be understood without conversation history.
- Retrieval queries should be concise natural questions/search statements useful for vector search.
- When useful, vary wording across queries rather than making trivial paraphrases.
- For AI Choice organization questions, approved source text may still use the former name Frontier Education Project; when useful, include that former name in one INTERNAL retrieval query so relevant approved material can still be found. Do not expose the former name in directResponse.
- If the question is already clear and standalone, keep it substantially unchanged.

DIRECT-RESPONSE RULES
- directResponse is required only for "conversation" and "out_of_scope".
- directResponse must be at most two short sentences and contain no citations.
- directResponse must not pretend to know facts that require retrieval.
- For "knowledge", "policy", and "knowledge_and_policy", directResponse must be an empty string.

Return ONLY valid JSON in this exact shape:
{
  "intent": "conversation|knowledge|policy|knowledge_and_policy|out_of_scope",
  "standaloneQuestion": "...",
  "queries": ["...", "..."],
  "policyQuery": {
    "state": null,
    "category": null,
    "status": null,
    "policyIdentifier": null,
    "searchText": null
  },
  "directResponse": ""
}
`;

  const input = [
    "RECENT CONVERSATION:",
    formatHistory(history),
    "",
    "CURRENT USER TURN:",
    question,
  ].join("\n");

  const payload = await openAiRequest("/responses", {
    model: config.openaiQueryModel,
    instructions,
    input,
    max_output_tokens: 650,
    store: false,
  });

  const text = extractResponseText(payload);

  if (!text) {
    return {
      intent: "knowledge",
      standaloneQuestion: question,
      queries: [question],
      policyQuery: normalizePolicyQuery(null),
      directResponse: "",
    };
  }

  try {
    const parsed = parseJsonObject(text);
    const intent = normalizeIntent(parsed?.intent);

    const standaloneQuestion =
      typeof parsed?.standaloneQuestion === "string" &&
      parsed.standaloneQuestion.trim()
        ? parsed.standaloneQuestion.trim()
        : question;

    const directResponse =
      typeof parsed?.directResponse === "string"
        ? parsed.directResponse.trim()
        : "";

    const policyQuery = normalizePolicyQuery(parsed?.policyQuery);

    if (intent === "conversation" || intent === "out_of_scope") {
      return {
        intent,
        standaloneQuestion,
        queries: [],
        policyQuery: normalizePolicyQuery(null),
        directResponse:
          directResponse ||
          (intent === "conversation"
            ? "You're welcome!"
            : "I can help with AI Choice, approved EdTech material, and policies listed in the AI Choice Map."),
      };
    }

    const needsKnowledge =
      intent === "knowledge" || intent === "knowledge_and_policy";

    const queries = needsKnowledge
      ? uniqueStrings(
          [
            // Always preserve the exact current user question as the primary
            // retrieval query. Planner rewrites are useful supplements, but
            // they must not crowd out the wording that the user actually sent.
            question,
            standaloneQuestion,
            ...(Array.isArray(parsed?.queries) ? parsed.queries : []),
          ],
          config.retrievalQueryCount,
        )
      : [];

    return {
      intent,
      standaloneQuestion,
      queries: needsKnowledge && queries.length === 0 ? [question] : queries,
      policyQuery:
        intent === "policy" || intent === "knowledge_and_policy"
          ? policyQuery
          : normalizePolicyQuery(null),
      directResponse: "",
    };
  } catch {
    return {
      intent: "knowledge",
      standaloneQuestion: question,
      queries: [question],
      policyQuery: normalizePolicyQuery(null),
      directResponse: "",
    };
  }
}

export async function createGroundedResponse({
  question,
  standaloneQuestion,
  history = [],
  context = "",
  knowledgeContext = "",
  policyContext = "",
}) {
  const resolvedKnowledgeContext = knowledgeContext || context || "";

  const instructions = `
You are the AI Choice virtual assistant.

QUESTION-UNDERSTANDING RULES
- Answer the user's ORIGINAL question naturally, including vague wording and conversational follow-ups.
- The standalone interpretation and recent conversation are provided only to help resolve what the user means.
- Do not mention query rewriting, retrieval planning, vector search, embeddings, prompts, database internals, or implementation details.
- Recent conversation is NOT an approved factual source. It may resolve references, but new factual claims must still be supported by one of the supplied approved contexts.

TWO-SOURCE GROUNDING MODEL
1. APPROVED KNOWLEDGE CONTEXT contains AI Choice organization/content/document knowledge retrieved from the approved RAG knowledge base.
2. STRUCTURED POLICY CONTEXT contains normalized policy records retrieved directly from the same policies table used by the AI Choice Map.

GROUNDING RULES
- Answer only from the supplied APPROVED KNOWLEDGE CONTEXT and STRUCTURED POLICY CONTEXT.
- Do not use outside knowledge, assumptions, memory, or unstated facts for factual claims.
- Organization/document facts must come from APPROVED KNOWLEDGE CONTEXT.
- Policy/map facts must come from STRUCTURED POLICY CONTEXT.
- Never infer a policy fact from organization/document context or an organization fact from policy rows.
- Do not invent states, bills, statuses, categories, effective dates, requirements, source URLs, or legal conclusions.
- If a requested policy field is absent from the structured row, omit it or say it is not available in the AI Choice Map data.
- If STRUCTURED POLICY CONTEXT says results were truncated, do not describe the displayed records/states as a complete list.
- If no matching structured policy rows are supplied for a requested policy portion, say: "I don't currently have a matching policy in the AI Choice Map data." Do not fall back to outside model knowledge.
- If approved knowledge is missing for a requested organization/document portion, say the approved material does not provide enough information rather than guessing.
- When approved source text uses the former name Frontier Education Project, use AI Choice in the public-facing answer unless the historical name itself is relevant.

POLICY SOURCE RULES
- Prefer the Official source URL stored in the policy row when the user asks for a source/link.
- Research source/provenance may also be mentioned when useful and when present.
- Never fabricate or transform URLs.
- Treat each structured row exactly as a record in the AI Choice Map data; do not imply broader legal completeness beyond the retrieved map data.

SOURCE-FIDELITY RULES FOR APPROVED KNOWLEDGE
- Preserve the terminology and classification used by the source.
- Do not relabel an "unmet need", "key finding", "initiative", "theme", or "focus" as a "top priority" unless the source explicitly does so.
- When a source presents distinct findings, keep them distinct rather than combining them merely because they appear in the same passage.
- Do not imply that a digital-citizenship or responsible-technology activity is an AI initiative unless the source explicitly says so.

CITATION RULES
- Every material factual bullet or paragraph must end with one or more citation labels copied EXACTLY from the supplied context.
- Knowledge citation labels look like [SETDA 2025, p.11] or another approved-source label.
- Policy citation labels look like [AI Choice Map: NJ SB 1227].
- Never invent a citation label.
- Use the citation label for the specific row/source that supports the claim.
- usedCitations must contain ONLY exact labels that are actually used in the answer and present in the supplied contexts.
- If the answer only states that matching information is unavailable and makes no source-derived factual claim, usedCitations should be [].

ANSWER STYLE
- Be concise, friendly, factual, and professional.
- Prefer short paragraphs or bullets for multiple items.
- For list questions such as "Which states have ...?", deduplicate states and provide the complete matching state list when all matching rows are present and the result notice says the list is complete.
- For a simple question, give a direct answer rather than an unnecessarily long report.

OUTPUT FORMAT
Return ONLY valid JSON:
{
  "answer": "the final user-visible answer, including inline citation labels when factual claims are supported",
  "usedCitations": ["[exact citation label]", "[another exact citation label]"]
}
`;

  const input = [
    "ORIGINAL USER QUESTION:",
    question,
    "",
    "STANDALONE INTERPRETATION FOR REFERENCE RESOLUTION:",
    standaloneQuestion || question,
    "",
    "RECENT CONVERSATION (reference resolution only; not an approved factual source):",
    formatHistory(history),
    "",
    "APPROVED KNOWLEDGE CONTEXT:",
    resolvedKnowledgeContext || "(none retrieved)",
    "",
    "STRUCTURED POLICY CONTEXT:",
    policyContext || "(none retrieved)",
  ].join("\n");

  const payload = await openAiRequest("/responses", {
    model: config.openaiChatModel,
    instructions,
    input,
    max_output_tokens: 1400,
    store: false,
  });

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI response did not contain answer text.");
  }

  try {
    const parsed = parseJsonObject(text);
    const answer =
      typeof parsed?.answer === "string" ? parsed.answer.trim() : "";

    if (!answer) {
      throw new Error("Grounded answer JSON did not contain an answer.");
    }

    const usedCitations = uniqueStrings(
      Array.isArray(parsed?.usedCitations) ? parsed.usedCitations : [],
      100,
    );

    return {
      answer,
      usedCitations,
    };
  } catch {
    // Safe compatibility fallback: keep the text as the answer. The service layer
    // will infer exact citation labels that appear in it before exposing sources.
    return {
      answer: text,
      usedCitations: [],
    };
  }
}
