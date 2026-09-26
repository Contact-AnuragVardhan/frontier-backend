import { supabase } from "../supabase.js";
import { toPolicyDto } from "../utils/policyDto.js";

export async function getPolicies(filters = {}) {
  let query = supabase
    .from("policies")
    .select("*")
    .order("state_name", { ascending: true })
    .order("title", { ascending: true });

  const state = filters.state?.trim();
  const category = filters.category?.trim();
  const status = filters.status?.trim();

  if (state && state.toLowerCase() !== "all") {
    query = state.length === 2
      ? query.eq("state_code", state.toUpperCase())
      : query.ilike("state_name", state);
  }
  if (category && category.toLowerCase() !== "all") query = query.eq("category", category);
  if (status && status.toLowerCase() !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load policies: ${error.message}`);
  return (data || []).map(toPolicyDto);
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
  const { data, error } = await supabase.from("policies").select("state_code,state_name,category,status");
  if (error) throw new Error(`Unable to load policy options: ${error.message}`);

  const statesMap = new Map();
  const categories = new Set();
  const statuses = new Set();
  for (const row of data || []) {
    statesMap.set(row.state_code, { code: row.state_code, name: row.state_name });
    categories.add(row.category);
    statuses.add(row.status);
  }
  return {
    states: Array.from(statesMap.values()).sort((a,b) => a.name.localeCompare(b.name)),
    categories: Array.from(categories).sort(),
    statuses: Array.from(statuses).sort(),
  };
}
