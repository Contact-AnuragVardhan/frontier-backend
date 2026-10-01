import { config } from "../config.js";
import { searchPoliciesForChat } from "./policyService.js";

function stringValue(value) {
  return value == null ? "" : String(value).trim();
}

function policyIdentity(policy) {
  return (
    stringValue(policy.policyIdentifier) ||
    stringValue(policy.title) ||
    `Policy ${policy.id}`
  );
}

export function policyCitationLabel(policy) {
  const state =
    stringValue(policy.stateCode) || stringValue(policy.stateName) || "Policy";
  return `[AI Choice Map: ${state} ${policyIdentity(policy)}]`;
}

export async function retrievePoliciesForChat(policyQuery = {}) {
  return searchPoliciesForChat({
    state: policyQuery?.state,
    category: policyQuery?.category,
    status: policyQuery?.status,
    policyIdentifier: policyQuery?.policyIdentifier,
    searchText: policyQuery?.searchText,
  });
}

function addField(lines, label, value) {
  const text = stringValue(value);
  if (text) lines.push(`${label}: ${text}`);
}

export function buildPolicyContext(policies, { truncated = false, limit = null } = {}) {
  const sections = [];
  let usedChars = 0;

  const uniqueStates = Array.from(
    new Set(
      policies
        .map((policy) => stringValue(policy.stateName) || stringValue(policy.stateCode))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const headerLines = [
    truncated
      ? `POLICY RESULT NOTICE: More than ${limit || policies.length} records matched. The context below contains only the first ${limit || policies.length} normalized policy records. Do not describe the result as a complete list.`
      : "POLICY RESULT NOTICE: All policy rows returned by the structured lookup are included below.",
    `Matching policy rows returned: ${policies.length}`,
  ];

  if (uniqueStates.length > 0) {
    headerLines.push(
      `${truncated ? "States represented in these returned rows" : "Complete matching state list from these rows"}: ${uniqueStates.join(", ")}`,
    );
  }

  const header = headerLines.join("\n");
  sections.push(header);
  usedChars += header.length;

  for (let index = 0; index < policies.length; index += 1) {
    const policy = policies[index];
    const lines = [
      `POLICY ITEM ${index + 1}`,
      `Citation label: ${policyCitationLabel(policy)}`,
    ];

    addField(lines, "State", policy.stateName);
    addField(lines, "State code", policy.stateCode);
    addField(lines, "Policy identifier", policy.policyIdentifier);
    addField(lines, "Title", policy.title);
    addField(lines, "Summary", policy.summary);
    addField(lines, "Policy type", policy.policyType);

    const categories = Array.isArray(policy.categories)
      ? policy.categories.filter(Boolean).join(", ")
      : "";
    addField(lines, "Categories", categories || policy.category);
    addField(lines, "Primary category", policy.category);
    addField(lines, "Status", policy.status);
    addField(lines, "Status detail", policy.statusDetail);
    addField(lines, "Effective date", policy.effectiveDate);
    addField(lines, "Implementation timeline", policy.implementationTimeline);
    addField(lines, "Official source", policy.sourceUrl);
    addField(lines, "Research source name", policy.researchSourceName);
    addField(lines, "Research source", policy.researchSourceUrl);
    addField(lines, "Research source date", policy.researchSourceDate);
    addField(lines, "Status as of", policy.statusAsOfDate);
    addField(lines, "Last updated", policy.lastUpdated);
    addField(lines, "Last verified", policy.lastVerifiedAt);

    const section = lines.join("\n");

    if (usedChars + section.length > config.ragMaxContextChars) {
      sections[0] =
        "POLICY RESULT NOTICE: The matching policy rows exceeded the safe prompt size. Only the records shown below are available to the answering model. Do not describe the result as a complete list.";
      break;
    }

    sections.push(section);
    usedChars += section.length;
  }

  return sections.join("\n\n---\n\n");
}

export function inferPolicyCitationsFromAnswer(policies, answer) {
  const text = stringValue(answer);
  if (!text) return [];

  const citations = [];
  const seen = new Set();

  for (const policy of policies) {
    const label = policyCitationLabel(policy);
    if (!seen.has(label) && text.includes(label)) {
      seen.add(label);
      citations.push(label);
    }
  }

  return citations;
}

export function toPublicPolicySources(policies, usedCitations = []) {
  const citationSet = new Set(
    (Array.isArray(usedCitations) ? usedCitations : [])
      .map((value) => stringValue(value))
      .filter(Boolean),
  );

  if (citationSet.size === 0) return [];

  const sources = [];
  const seen = new Set();

  for (const policy of policies) {
    const citationLabel = policyCitationLabel(policy);
    if (!citationSet.has(citationLabel)) continue;

    const key = policy.id != null ? `policy:${policy.id}` : citationLabel;
    if (seen.has(key)) continue;
    seen.add(key);

    sources.push({
      // Keep the existing chatbot source shape so the UI can continue rendering
      // sources without a policy-specific rewrite.
      title: policy.title || `${policy.stateName || "Policy"} ${policyIdentity(policy)}`,
      pageNumber: null,
      sourceUrl: policy.sourceUrl || null,
      documentUrl: policy.researchSourceUrl || null,
      citationLabel,

      // Additive metadata is safe for existing clients and useful to future UI work.
      sourceType: "policy",
      stateCode: policy.stateCode || null,
      stateName: policy.stateName || null,
      policyIdentifier: policy.policyIdentifier || null,
      researchSourceName: policy.researchSourceName || null,
      researchSourceUrl: policy.researchSourceUrl || null,
    });
  }

  return sources;
}
