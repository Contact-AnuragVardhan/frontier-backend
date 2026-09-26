import {
  createGroundedResponse,
  createRetrievalPlan,
} from "../openai.js";
import { config } from "../config.js";
import {
  buildRetrievedContext,
  inferCitationsFromAnswer,
  retrieveKnowledgeForQueries,
  toPublicSources,
} from "./knowledgeService.js";

const NO_KNOWLEDGE_ANSWER =
  "I don't have enough information in the currently approved Frontier sources to answer that. Please use Frontier's Contact page for more information.";

function normalizeHistory(history) {
  if (!Array.isArray(history) || config.chatHistoryMaxMessages === 0) {
    return [];
  }

  const normalized = [];
  let usedChars = 0;

  const candidates = history
    .filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant"),
    )
    .map((entry) => ({
      role: entry.role,
      content: String(entry.content || "").trim(),
    }))
    .filter((entry) => entry.content)
    .slice(-config.chatHistoryMaxMessages)
    .reverse();

  for (const entry of candidates) {
    if (usedChars >= config.chatHistoryMaxChars) break;

    const remaining = config.chatHistoryMaxChars - usedChars;
    const content = entry.content.slice(0, remaining);
    if (!content) break;

    normalized.push({
      role: entry.role,
      content,
    });

    usedChars += content.length;
  }

  return normalized.reverse();
}

export async function answerChatQuestion(message, history = []) {
  const normalizedHistory = normalizeHistory(history);

  let retrievalPlan = {
    intent: "knowledge",
    standaloneQuestion: message,
    queries: [message],
    directResponse: "",
  };

  try {
    retrievalPlan = await createRetrievalPlan({
      question: message,
      history: normalizedHistory,
    });
  } catch (error) {
    console.warn(
      "Turn routing/retrieval planning failed; falling back to knowledge retrieval.",
      error,
    );
  }

  if (
    retrievalPlan.intent === "conversation" ||
    retrievalPlan.intent === "out_of_scope"
  ) {
    return {
      answer:
        retrievalPlan.directResponse ||
        (retrievalPlan.intent === "conversation"
          ? "You're welcome!"
          : "I can help with Frontier Education Project and the approved EdTech material available here."),
      sources: [],
    };
  }

  const matches = await retrieveKnowledgeForQueries(
    retrievalPlan.queries,
  );

  if (matches.length === 0) {
    return {
      answer: NO_KNOWLEDGE_ANSWER,
      sources: [],
    };
  }

  const context = buildRetrievedContext(matches);

  if (!context) {
    return {
      answer: NO_KNOWLEDGE_ANSWER,
      sources: [],
    };
  }

  const grounded = await createGroundedResponse({
    question: message,
    standaloneQuestion: retrievalPlan.standaloneQuestion,
    history: normalizedHistory,
    context,
  });

  const usedCitations =
    grounded.usedCitations.length > 0
      ? grounded.usedCitations
      : inferCitationsFromAnswer(matches, grounded.answer);

  return {
    answer: grounded.answer,
    sources: toPublicSources(matches, usedCitations),
  };
}
