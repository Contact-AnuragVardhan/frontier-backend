import { supabase } from "../supabase.js";
import { toPolicyDto } from "../utils/policyDto.js";

const CHAT_POLICY_RESULT_LIMIT = 250;

function cleanFilter(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function createPoliciesQuery() {
  return supabase
    .from("policies")
    .select("*")
    .order("state_name", { ascending: true })
    .order("policy_identifier", { ascending: true });
}

function applyPolicyFilters(query, filters = {}) {
  const state = cleanFilter(filters.state);
  const category = cleanFilter(filters.category);
  const status = cleanFilter(filters.status);
  const policyIdentifier = cleanFilter(filters.policyIdentifier);
  const searchText = cleanFilter(filters.searchText);

  if (state && state.toLowerCase() !== "all") {
    query =
      state.length === 2
        ? query.eq("state_code", state.toUpperCase())
        : query.ilike("state_name", state);
  }

  if (category && category.toLowerCase() !== "all") {
    // `categories` is the normalized multi-category source used by the map.
    // This intentionally stays source-agnostic: any future normalized category
    // inserted by policy ingestion can be queried here without source-specific code.
    query = query.contains("categories", [category]);
  }

  if (status && status.toLowerCase() !== "all") {
    query = query.ilike("status", status);
  }

  if (policyIdentifier) {
    query = query.ilike("policy_identifier", policyIdentifier);
  }

  if (searchText) {
    // Optional free text is deliberately limited to the normalized display title.
    // More specific fields above should be preferred whenever the planner can extract them.
    query = query.ilike("title", `%${escapeLikePattern(searchText)}%`);
  }

  return query;
}

async function executePoliciesQuery(query) {
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load policies: ${error.message}`);
  return data || [];
}

export async function getPolicies(filters = {}) {
  const rows = await executePoliciesQuery(
    applyPolicyFilters(createPoliciesQuery(), filters),
  );

  return rows.map(toPolicyDto);
}

/**
 * Chatbot-specific policy lookup using the exact same normalized `policies`
 * table and filter logic as the map API. The extra row is used only to detect
 * truncation so a large result set is never silently presented as complete.
 */
async function resolveChatCategory(category) {
  const requested = cleanFilter(category);
  if (!requested || requested.toLowerCase() === "all") return requested;

  // Resolve against the categories actually present in the normalized table.
  // This keeps chatbot retrieval future-proof without embedding a category list
  // or any research-source-specific knowledge in code.
  const options = await getPolicyOptions();
  const requestedLower = requested.toLowerCase();
  const categories = options.categories || [];

  const exact = categories.find(
    (candidate) => candidate.toLowerCase() === requestedLower,
  );
  if (exact) return exact;

  const partialMatches = categories.filter((candidate) => {
    const candidateLower = candidate.toLowerCase();
    return (
      candidateLower.includes(requestedLower) ||
      requestedLower.includes(candidateLower)
    );
  });

  return partialMatches.length === 1 ? partialMatches[0] : requested;
}

export async function searchPoliciesForChat(filters = {}) {
  const resolvedFilters = {
    ...filters,
    category: await resolveChatCategory(filters.category),
  };

  const rows = await executePoliciesQuery(
    applyPolicyFilters(createPoliciesQuery(), resolvedFilters).limit(
      CHAT_POLICY_RESULT_LIMIT + 1,
    ),
  );

  return {
    policies: rows.slice(0, CHAT_POLICY_RESULT_LIMIT).map(toPolicyDto),
    truncated: rows.length > CHAT_POLICY_RESULT_LIMIT,
    limit: CHAT_POLICY_RESULT_LIMIT,
  };
}

export async function getPolicyById(id) {
  const { data, error } = await supabase.from("policies").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Unable to load policy: ${error.message}`);
  }
  return toPolicyDto(data);
}

export async function getPolicyOptions() {
  const { data, error } = await supabase
    .from("policies")
    .select("state_code,state_name,categories,status,policy_type");

  if (error) throw new Error(`Unable to load policy options: ${error.message}`);

  const statesMap = new Map();
  const categories = new Set();
  const statuses = new Set();
  const policyTypes = new Set();

  for (const row of data || []) {
    statesMap.set(row.state_code, { code: row.state_code, name: row.state_name });
    for (const category of row.categories || []) categories.add(category);
    if (row.status) statuses.add(row.status);
    if (row.policy_type) policyTypes.add(row.policy_type);
  }

  return {
    states: Array.from(statesMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    categories: Array.from(categories).sort(),
    statuses: Array.from(statuses).sort(),
    policyTypes: Array.from(policyTypes).sort(),
  };
}
