export function toPolicyDto(row) {
  return {
    id: row.id,
    stateCode: row.state_code,
    stateName: row.state_name,
    policyIdentifier: row.policy_identifier,
    title: row.title,
    summary: row.summary,
    policyType: row.policy_type,
    category: row.category,
    categories: row.categories || [row.category],
    status: row.status,
    statusDetail: row.status_detail,
    effectiveDate: row.effective_date,
    implementationTimeline: row.implementation_timeline,
    sourceUrl: row.source_url,
    researchSourceName: row.research_source_name,
    researchSourceUrl: row.research_source_url,
    researchSourceDate: row.research_source_date,
    statusAsOfDate: row.status_as_of_date,
    lastUpdated: row.last_updated,
    lastVerifiedAt: row.last_verified_at,
  };
}
