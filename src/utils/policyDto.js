export function toPolicyDto(row) {
  return {
    id: row.id,
    stateCode: row.state_code,
    stateName: row.state_name,
    title: row.title,
    summary: row.summary,
    category: row.category,
    status: row.status,
    effectiveDate: row.effective_date,
    sourceUrl: row.source_url,
    lastUpdated: row.last_updated,
  };
}
