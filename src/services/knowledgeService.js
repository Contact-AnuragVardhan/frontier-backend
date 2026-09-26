import { config } from "../config.js";
import { createEmbeddings } from "../openai.js";
import { supabase } from "../supabase.js";

function normalizeQueries(queries) {
  const seen = new Set();
  const normalized = [];

  for (const raw of Array.isArray(queries) ? queries : []) {
    const query = String(raw || "").trim();
    if (!query) continue;

    const key = query.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(query);

    if (normalized.length >= config.retrievalQueryCount) break;
  }

  return normalized;
}

async function searchEmbedding(embedding) {
  const { data, error } = await supabase.rpc(
    "match_frontier_knowledge",
    {
      query_embedding: embedding,
      match_threshold: config.retrievalMatchThreshold,
      match_count: config.retrievalMatchCount,
      filter_source_key: config.knowledgeSourceKey,
    },
  );

  if (error) {
    throw new Error(
      `Unable to search Frontier knowledge: ${error.message}`,
    );
  }

  return data || [];
}

function mergeMatches(resultSets) {
  const byChunk = new Map();

  for (const matches of resultSets) {
    for (const match of matches) {
      const key =
        match.chunk_id != null
          ? `chunk:${match.chunk_id}`
          : `source:${match.source_id}:index:${match.chunk_index ?? ""}:page:${match.page_number ?? ""}`;

      const similarity = Number(match.similarity || 0);
      const existing = byChunk.get(key);

      if (!existing) {
        byChunk.set(key, {
          ...match,
          similarity,
          _queryHits: 1,
        });
        continue;
      }

      existing._queryHits += 1;

      if (similarity > Number(existing.similarity || 0)) {
        Object.assign(existing, match, {
          similarity,
          _queryHits: existing._queryHits,
        });
      }
    }
  }

  return Array.from(byChunk.values())
    .sort((a, b) => {
      const aScore =
        Number(a.similarity || 0) +
        Math.min((a._queryHits || 1) - 1, 2) * 0.015;

      const bScore =
        Number(b.similarity || 0) +
        Math.min((b._queryHits || 1) - 1, 2) * 0.015;

      return bScore - aScore;
    })
    .slice(0, config.retrievalMatchCount)
    .map(({ _queryHits, ...match }) => match);
}

export async function retrieveKnowledge(question) {
  return retrieveKnowledgeForQueries([question]);
}

export async function retrieveKnowledgeForQueries(queries) {
  const normalizedQueries = normalizeQueries(queries);
  if (normalizedQueries.length === 0) return [];

  const embeddings = await createEmbeddings(normalizedQueries);

  const resultSets = await Promise.all(
    embeddings.map((embedding) => searchEmbedding(embedding)),
  );

  return mergeMatches(resultSets);
}

export function citationLabelForMatch(match) {
  const sourceTitle =
    match.source_title || "Approved Frontier source";
  const sourceKey = match.source_key || "unknown-source";
  const pageNumber = match.page_number ?? "unknown";

  return sourceKey === "setda-state-edtech-trends-2025" &&
    pageNumber !== "unknown"
    ? `[SETDA 2025, p.${pageNumber}]`
    : `[${sourceTitle}${
        pageNumber !== "unknown" ? `, p.${pageNumber}` : ""
      }]`;
}

export function buildRetrievedContext(matches) {
  let usedChars = 0;
  const sections = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const sourceTitle =
      match.source_title || "Approved Frontier source";
    const sourceKey = match.source_key || "unknown-source";
    const pageNumber = match.page_number ?? "unknown";
    const citationLabel = citationLabelForMatch(match);

    const section = [
      `CONTEXT ITEM ${index + 1}`,
      `Source: ${sourceTitle}`,
      `Source key: ${sourceKey}`,
      `Page: ${pageNumber}`,
      `Citation label: ${citationLabel}`,
      "Passage:",
      String(match.content || "").trim(),
    ].join("\n");

    if (!section.trim()) continue;

    if (
      usedChars + section.length >
      config.ragMaxContextChars
    ) {
      break;
    }

    sections.push(section);
    usedChars += section.length;
  }

  return sections.join("\n\n---\n\n");
}

export function inferCitationsFromAnswer(matches, answer) {
  const text = String(answer || "");
  if (!text) return [];

  const citations = [];
  const seen = new Set();

  for (const match of matches) {
    const label = citationLabelForMatch(match);
    if (seen.has(label)) continue;

    if (text.includes(label)) {
      seen.add(label);
      citations.push(label);
    }
  }

  return citations;
}

export function toPublicSources(
  matches,
  usedCitations = [],
) {
  const citationSet = new Set(
    (Array.isArray(usedCitations) ? usedCitations : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );

  if (citationSet.size === 0) return [];

  const seen = new Set();
  const sources = [];

  for (const match of matches) {
    const citationLabel = citationLabelForMatch(match);

    if (!citationSet.has(citationLabel)) continue;

    const key = `${match.source_id}:${match.page_number ?? ""}`;
    if (seen.has(key)) continue;

    seen.add(key);

    sources.push({
      title: match.source_title,
      pageNumber: match.page_number,
      sourceUrl: match.source_url,
      documentUrl: match.document_url,
      citationLabel,
    });
  }

  return sources;
}

export async function getKnowledgeStatus() {
  let query = supabase
    .from("frontier_knowledge_sources")
    .select(
      "source_key,title,publisher,source_year,status,page_count,chunk_count,embedding_model,embedding_dimensions,ingested_at",
    )
    .order("source_year", { ascending: false });

  if (config.knowledgeSourceKey) {
    query = query.eq(
      "source_key",
      config.knowledgeSourceKey,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Unable to read knowledge status: ${error.message}`,
    );
  }

  const sources = data || [];

  return {
    ready:
      sources.length > 0 &&
      sources.every((source) => source.status === "ready"),
    sourceCount: sources.length,
    totalChunks: sources.reduce(
      (sum, source) =>
        sum + Number(source.chunk_count || 0),
      0,
    ),
    sources,
  };
}
