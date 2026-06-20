export type Household = {
  household_id: string;
  name: string;
  city: string;
  tariff_id: string;
};

export type Hub = {
  annual_cost_eur: number;
  consumption_kwh: number;
  pv_production_kwh: number;
  pv_self_consumption_pct?: number | null;
};

export type NodeKind = "device" | "contract";

export type EnergyNode = {
  kind: NodeKind;
  device_id: number | null;
  category: string;
  icon: string;
  label: string;
  metric: string;
};

export type AdviceProjection = {
  baseline_cost_eur?: number | null;
  counterfactual_cost_eur?: number | null;
  payback_years?: number | null;
};

export type Advice = {
  fact_key: string;
  category: string;
  device_id: number | null;
  severity: "info" | "warning" | "high" | string;
  title: string;
  body: string;
  benefit_eur: number | null;
  advice: AdviceProjection | null;
  action_type: string | null;
  action_label: string | null;
};

export type HouseholdView = {
  household: Household;
  hub: Hub | null;
  nodes: EnergyNode[];
  advice: Advice[];
};

export type ActionEvent = {
  action_type: string;
  label: string;
  message: string;
  status: string;
  expected_savings_eur?: number | null;
};
