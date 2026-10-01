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
import {
  buildPolicyContext,
  inferPolicyCitationsFromAnswer,
  retrievePoliciesForChat,
  toPublicPolicySources,
} from "./policyChatService.js";

const NO_KNOWLEDGE_ANSWER =
  "I don't have enough information in the currently approved AI Choice sources to answer that. Please use the AI Choice Contact page for more information.";

const NO_POLICY_ANSWER =
  "I don't currently have a matching policy in the AI Choice Map data.";

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

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }

  return result;
}

export async function answerChatQuestion(message, history = []) {
  const normalizedHistory = normalizeHistory(history);

  let retrievalPlan = {
    intent: "knowledge",
    standaloneQuestion: message,
    queries: [message],
    policyQuery: {
      state: null,
      category: null,
      status: null,
      policyIdentifier: null,
      searchText: null,
    },
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
          : "I can help with AI Choice, approved EdTech material, and policies listed in the AI Choice Map."),
      sources: [],
    };
  }

  const needsKnowledge =
    retrievalPlan.intent === "knowledge" ||
    retrievalPlan.intent === "knowledge_and_policy";
  const needsPolicy =
    retrievalPlan.intent === "policy" ||
    retrievalPlan.intent === "knowledge_and_policy";

  const [knowledgeMatches, policyResult] = await Promise.all([
    needsKnowledge
      ? retrieveKnowledgeForQueries(retrievalPlan.queries)
      : Promise.resolve([]),
    needsPolicy
      ? retrievePoliciesForChat(retrievalPlan.policyQuery)
      : Promise.resolve({ policies: [], truncated: false, limit: 0 }),
  ]);

  const policies = policyResult.policies || [];

  if (retrievalPlan.intent === "knowledge" && knowledgeMatches.length === 0) {
    return {
      answer: NO_KNOWLEDGE_ANSWER,
      sources: [],
    };
  }

  if (retrievalPlan.intent === "policy" && policies.length === 0) {
    return {
      answer: NO_POLICY_ANSWER,
      sources: [],
    };
  }

  if (
    retrievalPlan.intent === "knowledge_and_policy" &&
    knowledgeMatches.length === 0 &&
    policies.length === 0
  ) {
    return {
      answer:
        "I don't have enough matching information in the approved AI Choice sources or the AI Choice Map data to answer that.",
      sources: [],
    };
  }

  const knowledgeContext = needsKnowledge
    ? buildRetrievedContext(knowledgeMatches)
    : "";
  const policyContext = needsPolicy
    ? buildPolicyContext(policies, {
        truncated: policyResult.truncated,
        limit: policyResult.limit,
      })
    : "";

  if (
    retrievalPlan.intent === "knowledge" &&
    !knowledgeContext
  ) {
    return {
      answer: NO_KNOWLEDGE_ANSWER,
      sources: [],
    };
  }

  const grounded = await createGroundedResponse({
    question: message,
    standaloneQuestion: retrievalPlan.standaloneQuestion,
    history: normalizedHistory,
    knowledgeContext,
    policyContext,
  });

  const inferredCitations = uniqueStrings([
    ...inferCitationsFromAnswer(knowledgeMatches, grounded.answer),
    ...inferPolicyCitationsFromAnswer(policies, grounded.answer),
  ]);

  const usedCitations =
    grounded.usedCitations.length > 0
      ? grounded.usedCitations
      : inferredCitations;

  return {
    answer: grounded.answer,
    sources: [
      ...toPublicSources(knowledgeMatches, usedCitations),
      ...toPublicPolicySources(policies, usedCitations),
    ],
  };
}
