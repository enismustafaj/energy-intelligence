import type { Household, HouseholdView } from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(apiUrl(url));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listHouseholds(): Promise<Household[]> {
  const data = await getJson<{ households: Household[] }>("/api/households");
  return data.households;
}

export function getHouseholdView(householdId: string): Promise<HouseholdView> {
  return getJson<HouseholdView>(`/api/households/${householdId}/view`);
}

export async function runAction(householdId: string, actionType: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/actions/${actionType}?household_id=${householdId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Action not available");
  }
}
