import type { Advice, Household, HouseholdView } from "./types";

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

export async function getAdvice(
  householdId: string,
  filter: { deviceId?: number; category?: string } = {},
): Promise<Advice[]> {
  const params = new URLSearchParams();
  if (filter.deviceId !== undefined) params.set("device_id", String(filter.deviceId));
  if (filter.category !== undefined) params.set("category", filter.category);
  const suffix = params.size ? `?${params.toString()}` : "";
  const data = await getJson<{ advice: Advice[] }>(`/api/advice/${householdId}${suffix}`);
  return data.advice;
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
