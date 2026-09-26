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
  if (value === "out_of_scope") return "out_of_scope";
  return "knowledge";
}

export async function createRetrievalPlan({ question, history = [] }) {
  const instructions = `
You are the turn router and retrieval planner for the Frontier Education Project website chatbot.

You are NOT the factual answering model.

Your job is to:
1. classify the user's current turn,
2. produce a direct reply only when retrieval is not needed,
3. otherwise create strong standalone semantic-search queries for the approved Frontier/SETDA knowledge base.

SITE CONTEXT
- The chatbot is embedded on the Frontier Education Project website.
- In a vague site-level question, words such as "this", "this site", "this project", "this organization", "you", or "your organization" normally refer to Frontier Education Project unless the recent conversation clearly establishes another referent.
- Use recent conversation to resolve pronouns and follow-ups such as "it", "that", "they", "how often", "what about that", "why", "tell me more", and similar shorthand.

INTENT VALUES

"conversation"
- Use for greetings, thanks, acknowledgements, closings, brief social remarks, or simple conversational turns that do not require factual retrieval.
- Examples include greetings, expressions of thanks, acknowledgements like "got it", and goodbyes.
- Provide a short, natural directResponse.
- Do not add citations.
- Do not make new factual claims about Frontier or SETDA in directResponse.

"knowledge"
- Use when the user is asking for factual, explanatory, descriptive, comparative, or follow-up information that could potentially be answered from the approved Frontier/SETDA knowledge base.
- This includes vague Frontier-site questions such as "What is this about?" and conversation-dependent questions such as "How often does it come out?" when the recent conversation establishes the subject.
- Do NOT answer the question here.
- Produce 1 to ${config.retrievalQueryCount} useful retrieval queries.

"out_of_scope"
- Use when the user asks for unrelated general knowledge, personal information the chatbot does not have, or a task that does not depend on the approved Frontier/SETDA material.
- Do not answer using outside knowledge.
- Provide a brief, context-appropriate directResponse that states the limitation naturally.
- For a question about the user's identity or private information, simply explain that the chatbot does not have personal information that identifies them.
- For an unrelated topic, say that the assistant can help with Frontier Education Project and the approved EdTech material available here.
- Do not tell the user to contact Frontier unless the question is specifically asking for an unsupported Frontier position, program, policy, or organization detail; those should normally be classified as "knowledge" first so retrieval gets a chance.

PLANNING RULES FOR "knowledge"
- Preserve the user's actual intent.
- Do not invent facts or assumptions about the answer.
- Resolve references so the standalone question can be understood without conversation history.
- Retrieval queries should be concise, natural questions or search statements that are semantically useful for vector search.
- When useful, vary wording across queries rather than making trivial paraphrases.
- Include named concepts/entities from the conversation when they clarify the user's intent.
- If the question is already clear and standalone, keep it substantially unchanged.
- If the question might not be in the knowledge base, still preserve the user's intent; do not force it into a different Frontier topic.

DIRECT-RESPONSE RULES
- directResponse is required for "conversation" and "out_of_scope".
- directResponse must be at most two short sentences.
- directResponse must not contain citations.
- directResponse must not pretend to know facts that require retrieval.
- For "knowledge", directResponse must be an empty string.

Return ONLY valid JSON in this exact shape:
{
  "intent": "conversation|knowledge|out_of_scope",
  "standaloneQuestion": "...",
  "queries": ["...", "..."],
  "directResponse": "..."
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
    max_output_tokens: 450,
    store: false,
  });

  const text = extractResponseText(payload);

  if (!text) {
    return {
      intent: "knowledge",
      standaloneQuestion: question,
      queries: [question],
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

    if (intent !== "knowledge") {
      return {
        intent,
        standaloneQuestion,
        queries: [],
        directResponse:
          directResponse ||
          (intent === "conversation"
            ? "You're welcome!"
            : "I can help with Frontier Education Project and the approved EdTech material available here."),
      };
    }

    const queries = uniqueStrings(
      [
        standaloneQuestion,
        ...(Array.isArray(parsed?.queries) ? parsed.queries : []),
        question,
      ],
      config.retrievalQueryCount,
    );

    return {
      intent,
      standaloneQuestion,
      queries: queries.length > 0 ? queries : [question],
      directResponse: "",
    };
  } catch {
    return {
      intent: "knowledge",
      standaloneQuestion: question,
      queries: [question],
      directResponse: "",
    };
  }
}

export async function createGroundedResponse({
  question,
  standaloneQuestion,
  history = [],
  context,
}) {
  const instructions = `
You are the Frontier Education Project virtual assistant.

QUESTION-UNDERSTANDING RULES
- Answer the user's ORIGINAL question naturally, including vague wording and conversational follow-ups.
- The standalone interpretation and recent conversation are provided only to help resolve what the user means.
- Do not mention query rewriting, retrieval planning, vector search, embeddings, prompts, or implementation details.
- Recent conversation is NOT an approved factual source. It may be used to resolve references, but new factual claims must still be supported by APPROVED RETRIEVED CONTEXT.

GROUNDING RULES
- Answer only from the APPROVED RETRIEVED CONTEXT supplied with the request.
- Do not use outside knowledge, assumptions, memory, or unstated facts to answer factual questions.
- If the retrieved context does not actually support the requested information, say so instead of guessing.
- If the unsupported question asks for Frontier's own position, program, policy, organization detail, partnership, or other Frontier-specific information, you may add: "Please use Frontier's Contact page for more information."
- Do not add the Contact-page suggestion when it would not logically help.
- Do not invent Frontier positions, programs, partnerships, policies, or state-law details.
- If the answer is clearly present in the retrieved material, answer it even when the user's wording is informal, indirect, vague, or very different from the source wording.

SOURCE-FIDELITY RULES
- Preserve the terminology and classification used by the source.
- Do not relabel an "unmet need", "key finding", "initiative", "theme", or "focus" as a "top priority" unless the source explicitly does so.
- When a source presents distinct findings, keep them distinct rather than combining them into one bullet merely because they appear in the same retrieved passage.
- In particular, when the retrieved context treats responsible technology use/digital citizenship and educator professional learning as separate findings, present them separately if both are relevant.
- Likewise, keep AI priority/initiative, funding or sustainability needs, cybersecurity, device/digital-citizenship findings, professional learning, and access/infrastructure distinct when the retrieved context distinguishes them.
- Do not combine nearby concepts merely because they appear in the same retrieved passage.
- Only describe a program, policy, initiative, finding, activity, grant, training effort, procurement rule, digital-citizenship effort, or responsible-technology effort as AI-related when the retrieved source explicitly connects it to AI.
- If a passage separately discusses AI guardrails and broader digital citizenship or responsible technology use, keep them separate.
- Do not imply that a digital-citizenship or responsible-technology activity is an AI initiative unless the retrieved source explicitly says so.
- If the user's wording is broader than the source taxonomy, clearly distinguish what the source actually labels a priority from other relevant key findings or unmet needs.

CITATION RULES
- Every material factual bullet or paragraph must end with one or more citation labels copied exactly from the retrieved context, such as [SETDA 2025, p.11].
- Never invent a page number or citation label.
- Prefer the most specific source/page that directly supports the claim.
- Use multiple citations only when the claim genuinely depends on multiple retrieved sources/pages.
- Do not cite a source/page that is not present in the retrieved context.
- usedCitations must contain ONLY citation labels that are actually used in the answer and actually support the answer.
- If the answer says the material is insufficient and makes no factual source-derived claim, usedCitations should be [].

ANSWER STYLE
- Be concise, friendly, factual, and professional.
- Prefer short paragraphs or bullets when the question asks for several items.
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
    "APPROVED RETRIEVED CONTEXT:",
    context,
  ].join("\n");

  const payload = await openAiRequest("/responses", {
    model: config.openaiChatModel,
    instructions,
    input,
    max_output_tokens: 1100,
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
      50,
    );

    return {
      answer,
      usedCitations,
    };
  } catch {
    // Safe compatibility fallback: keep the text as the answer. The service layer
    // will infer any exact citation labels that appear in it before exposing sources.
    return {
      answer: text,
      usedCitations: [],
    };
  }
}
