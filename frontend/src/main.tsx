import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  createTheme,
  Group,
  Loader,
  MantineProvider,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  ArrowLeft,
  Battery,
  Bolt,
  CalendarPlus,
  Car,
  CheckCircle2,
  Home,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSun,
  TrendingDown,
  Zap,
} from "lucide-react";
import { API_BASE_URL, getAdvice, getHouseholdView, listHouseholds, runAction } from "./api";
import type { ActionEvent, Advice, Household, HouseholdView } from "./types";
import "@mantine/core/styles.css";
import "./styles.css";

const theme = createTheme({
  primaryColor: "violet",
  defaultRadius: "md",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: { fontFamily: "Inter, sans-serif", fontWeight: "600" },
});

type Route = { name: "home" } | { name: "household"; householdId: string };
type ActiveSelection = { type: "all" } | { type: "contract" } | { type: "device"; deviceId: number };
type ActionLogItem = { id: string; message: string; status: string; savings?: number | null };

const CATEGORY_COLOR: Record<string, string> = {
  device_choice: "green",
  contract: "blue",
  utilization: "yellow",
  fault: "red",
};

function parseRoute(): Route {
  const match = window.location.pathname.match(/^\/h\/([^/]+)$/);
  if (match) return { name: "household", householdId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatEuro(value: number | null | undefined): string {
  if (value == null) return "";
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <Box className="app-shell">
        <Container size="lg" py="lg">
          {route.name === "home" ? <HouseholdPicker /> : <Dashboard householdId={route.householdId} />}
        </Container>
      </Box>
    </MantineProvider>
  );
}

function HouseholdPicker() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    listHouseholds()
      .then((items) => {
        if (!cancelled) {
          setHouseholds(items);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack gap="lg">
      <DashboardChrome
        title="Dark Energy"
        subtitle="Choose a household · live energy intelligence"
        right={status === "ready" ? <LivePill label={`${households.length} active homes`} /> : null}
      />

      {status === "loading" && (
        <Center py="xl">
          <Loader color="violet" />
        </Center>
      )}
      {status === "error" && (
        <Alert color="red" variant="light">
          Could not load households.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {households.map((household) => (
          <Card
            key={household.household_id}
            className="home-card"
            withBorder
            padding="lg"
            radius="md"
            onClick={() => navigate(`/h/${household.household_id}`)}
            role="button"
          >
            <Group justify="space-between" align="flex-start">
              <Badge variant="light" color="violet" radius="xl">
                {household.household_id}
              </Badge>
              <ThemeIcon color="violet" variant="light">
                <Home size={17} />
              </ThemeIcon>
            </Group>
            <Text fw={600} fz="lg" mt="md">
              {household.name}
            </Text>
            <Text c="dimmed" fz="sm" mt={4}>
              {household.city} · {household.tariff_id} tariff
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function Dashboard({ householdId }: { householdId: string }) {
  const [view, setView] = useState<HouseholdView | null>(null);
  const [selection, setSelection] = useState<ActiveSelection>({ type: "all" });
  const [advice, setAdvice] = useState<Advice[]>([]);
  const [actionLog, setActionLog] = useState<ActionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHouseholdView(householdId)
      .then((data) => {
        if (!cancelled) {
          setView(data);
          setAdvice(data.advice);
          setSelection({ type: "all" });
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load household.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const filter =
      selection.type === "contract"
        ? { category: "contract" }
        : selection.type === "device"
          ? { deviceId: selection.deviceId }
          : {};
    getAdvice(householdId, filter)
      .then((items) => {
        if (!cancelled) setAdvice(items);
      })
      .catch(() => {
        if (!cancelled) setAdvice([]);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, selection, view]);

  useEffect(() => {
    const stream = new EventSource(`${API_BASE_URL}/api/stream/${householdId}`);
    stream.addEventListener("action", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as ActionEvent;
      setActionLog((items) => [
        {
          id: `${Date.now()}-${data.action_type}`,
          message: data.message,
          status: data.status,
          savings: data.expected_savings_eur,
        },
        ...items,
      ]);
    });
    return () => stream.close();
  }, [householdId]);

  const filteredTitle = useMemo(() => {
    if (!view) return "Recommendations";
    if (selection.type === "contract") return "Contract recommendations";
    if (selection.type === "device") {
      const node = view.nodes.find((item) => item.device_id === selection.deviceId);
      return node ? `${node.label} recommendations` : "Device recommendations";
    }
    return "Recommendations";
  }, [selection, view]);

  async function handleAction(actionType: string) {
    try {
      await runAction(householdId, actionType);
    } catch (err) {
      setActionLog((items) => [
        {
          id: `${Date.now()}-${actionType}-failed`,
          message: err instanceof Error ? err.message : "Action not available",
          status: "failed",
        },
        ...items,
      ]);
    }
  }

  if (loading)
    return (
      <Center py="xl">
        <Loader color="violet" />
      </Center>
    );
  if (error || !view)
    return (
      <Alert color="red" variant="light">
        {error || "Household not found."}
      </Alert>
    );

  const primaryAdvice = advice[0] ?? view.advice[0];

  return (
    <Stack gap="md">
      <DashboardChrome
        title="Dark Energy"
        subtitle={`${view.household.household_id} · ${view.household.city} · all devices`}
        leftAction={
          <Button variant="subtle" color="gray" size="compact-sm" leftSection={<ArrowLeft size={14} />} onClick={() => navigate("/")}>
            homes
          </Button>
        }
        right={<LivePill label="live · updated now" />}
      />

      <KpiStrip view={view} advice={view.advice} />

      <EnergyFlow view={view} selection={selection} onSelect={setSelection} />

      <InsightCard advice={primaryAdvice} onAction={handleAction} />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ForecastCard view={view} />
        <DetectedCard view={view} advice={view.advice} onSelect={setSelection} />
      </SimpleGrid>

      <Paper withBorder radius="lg" p="md" className="panel-card">
        <Group justify="space-between" align="center" mb="sm">
          <Text fz="sm" c="dimmed">
            {filteredTitle}
          </Text>
          {selection.type !== "all" && (
            <Button variant="default" size="compact-sm" leftSection={<RotateCcw size={14} />} onClick={() => setSelection({ type: "all" })}>
              Show all
            </Button>
          )}
        </Group>
        <AdviceList advice={advice} onAction={handleAction} />
      </Paper>

      <ActionLog items={actionLog} />
    </Stack>
  );
}

function DashboardChrome({
  title,
  subtitle,
  leftAction,
  right,
}: {
  title: string;
  subtitle: string;
  leftAction?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="center" className="dashboard-chrome">
      <Group gap="sm">
        {leftAction}
        <ThemeIcon className="brand-mark" size={34} radius="md">
          <Bolt size={20} />
        </ThemeIcon>
        <Box>
          <Text fw={600} fz="md" lh={1.25}>
            {title}
          </Text>
          <Text c="dimmed" fz="xs">
            {subtitle}
          </Text>
        </Box>
      </Group>
      {right}
    </Group>
  );
}

function LivePill({ label }: { label: string }) {
  return (
    <Group gap={6} className="live-pill" wrap="nowrap">
      <span className="live-dot" aria-hidden="true" />
      <Text fz="xs">{label}</Text>
    </Group>
  );
}

function KpiStrip({ view, advice }: { view: HouseholdView; advice: Advice[] }) {
  const annualCost = view.hub?.annual_cost_eur ?? 0;
  const monthlyCost = annualCost / 12;
  const selfSufficiency =
    view.hub && view.hub.consumption_kwh > 0
      ? Math.min(100, Math.round((view.hub.pv_production_kwh / view.hub.consumption_kwh) * 100))
      : 0;
  const savings = advice.reduce((sum, item) => sum + (item.benefit_eur ?? 0), 0);
  const anomalies = advice.filter((item) => item.severity === "high" || item.severity === "warning").length;

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
      <MetricTile label="Projected bill" value={`€${formatEuro(monthlyCost)}`} detail="monthly run-rate" tone="success" icon={<TrendingDown size={14} />} />
      <MetricTile label="Self-sufficiency" value={`${selfSufficiency}%`} detail="solar coverage" />
      <MetricTile label="Saved this year" value={`€${formatEuro(savings)}`} detail="ranked opportunities" />
      <MetricTile label="Anomalies" value={String(anomalies)} detail="need attention" danger={anomalies > 0} />
    </SimpleGrid>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone,
  danger,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "success";
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Paper radius="md" p="md" className="metric-tile">
      <Text fz="sm" c="dimmed" mb={4}>
        {label}
      </Text>
      <Text fz={25} fw={600} lh={1.15} c={danger ? "red.7" : undefined}>
        {value}
      </Text>
      <Group gap={4} mt={4} c={tone === "success" ? "green.7" : "dimmed"} wrap="nowrap">
        {icon}
        <Text fz="xs">{detail}</Text>
      </Group>
    </Paper>
  );
}

function EnergyFlow({
  view,
  selection,
  onSelect,
}: {
  view: HouseholdView;
  selection: ActiveSelection;
  onSelect: (selection: ActiveSelection) => void;
}) {
  const nodeByCategory = new Map(view.nodes.map((node) => [node.category, node]));
  const solar = nodeByCategory.get("pv");
  const battery = nodeByCategory.get("battery");
  const ev = nodeByCategory.get("ev");
  const heatPump = nodeByCategory.get("heat_pump");

  function isActive(category: string): boolean {
    if (selection.type === "all") return false;
    if (selection.type === "contract") return category === "contract";
    return view.nodes.some((node) => node.category === category && node.device_id === selection.deviceId);
  }

  function selectCategory(category: string) {
    const node = nodeByCategory.get(category);
    if (!node) return;
    if (node.device_id != null) onSelect({ type: "device", deviceId: node.device_id });
  }

  return (
    <Paper withBorder radius="lg" p="md" className="panel-card flow-panel">
      <Group justify="space-between" mb={4}>
        <Text fz="sm" c="dimmed">
          Live energy flow
        </Text>
        <Text fz="xs" c="dimmed">
          now
        </Text>
      </Group>
      <svg viewBox="0 0 680 210" width="100%" className="flow-svg" role="img" aria-label="Energy flowing through the household">
        <path d="M140 41 L290 96" className="de-flow solar-flow" />
        <path d="M140 105 L290 105" className="de-flow battery-flow" />
        <path d="M140 172 L290 116" className="de-flow grid-flow" />
        <path d="M410 96 L540 54" className="de-flow ev-flow" />
        <path d="M410 116 L540 158" className="de-flow heat-flow" />

        <FlowNode x={20} y={18} color="amber" title="Solar" subtitle={solar?.metric || "production"} icon={<Sun size={15} />} active={isActive("pv")} onClick={() => selectCategory("pv")} />
        <FlowNode x={20} y={82} color="green" title="Battery" subtitle={battery?.metric || "standby"} icon={<Battery size={15} />} active={isActive("battery")} onClick={() => selectCategory("battery")} />
        <FlowNode x={20} y={149} color="blue" title="Grid" subtitle="balancing" icon={<Zap size={15} />} />
        <FlowNode x={288} y={76} width={124} height={58} color="gray" title="Home" subtitle={`${formatEuro(view.hub?.consumption_kwh)} kWh/yr`} icon={<Home size={15} />} onClick={() => onSelect({ type: "all" })} />
        <FlowNode x={540} y={31} color="teal" title="EV" subtitle={ev?.metric || "not installed"} icon={<Car size={15} />} active={isActive("ev")} onClick={() => selectCategory("ev")} muted={!ev} />
        <FlowNode x={540} y={135} color="purple" title="Heat pump" subtitle={heatPump?.metric || "not installed"} icon={<ThermometerSun size={15} />} active={isActive("heat_pump")} onClick={() => selectCategory("heat_pump")} muted={!heatPump} />
      </svg>
    </Paper>
  );
}

function FlowNode({
  x,
  y,
  title,
  subtitle,
  color,
  icon,
  active,
  muted,
  onClick,
  width = 120,
  height = 46,
}: {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
  width?: number;
  height?: number;
}) {
  return (
    <g className={`flow-node c-${color} ${active ? "active" : ""} ${muted ? "muted" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <rect x={x} y={y} width={width} height={height} rx="8" />
      <foreignObject x={x + 14} y={y + 12} width="18" height="18">
        <span className="flow-icon">{icon}</span>
      </foreignObject>
      <text className="flow-title" x={x + 38} y={y + 21}>
        {title}
      </text>
      <text className="flow-subtitle" x={x + 38} y={y + 37}>
        {subtitle}
      </text>
    </g>
  );
}

function InsightCard({ advice, onAction }: { advice?: Advice; onAction: (actionType: string) => void }) {
  return (
    <Paper withBorder radius="lg" p="md" className="panel-card insight-card">
      <Group justify="space-between" align="center" mb="sm">
        <Group gap="sm">
          <ThemeIcon className="insight-icon" size={30} radius="md">
            <Sparkles size={18} />
          </ThemeIcon>
          <Text fw={600}>Dark Energy insight</Text>
        </Group>
        <Badge color="green" variant="light" radius="xl" leftSection={<ShieldCheck size={13} />}>
          grounded in your data
        </Badge>
      </Group>

      {advice ? (
        <>
          <Text fz="md" lh={1.65}>
            <Text component="span" className="soft-highlight danger">
              {advice.title}
            </Text>{" "}
            {advice.body}{" "}
            {advice.benefit_eur ? (
              <Text component="span" className="soft-highlight success">
                save about €{advice.benefit_eur}/yr
              </Text>
            ) : null}
          </Text>
          <Group gap="xs" mt="md">
            {advice.action_type && (
              <Button color="dark" leftSection={<CalendarPlus size={15} />} onClick={() => onAction(advice.action_type as string)}>
                {advice.action_label || "Take action"}
              </Button>
            )}
            <Button variant="default">Why this?</Button>
          </Group>
        </>
      ) : (
        <Text c="dimmed">No insight is currently available for this household.</Text>
      )}
    </Paper>
  );
}

function ForecastCard({ view }: { view: HouseholdView }) {
  const monthlyCost = (view.hub?.annual_cost_eur ?? 0) / 12;
  return (
    <Paper withBorder radius="lg" p="md" className="panel-card">
      <Group justify="space-between" mb="xs">
        <Text fz="sm" c="dimmed">
          Bill forecast → month end
        </Text>
        <Text fz="sm" fw={600} c="green.7">
          €{formatEuro(monthlyCost)} ±9
        </Text>
      </Group>
      <svg viewBox="0 0 300 118" width="100%" className="forecast-chart" role="img" aria-label="Bill forecast chart">
        <line x1="0" y1="104" x2="300" y2="104" />
        <polygon points="196,70 300,40 300,74 196,86" />
        <polyline points="6,52 40,58 74,46 108,70 142,60 196,78" className="actual" />
        <polyline points="196,78 300,57" className="forecast" />
        <circle cx="108" cy="70" r="5" className="anomaly-ring" />
        <circle cx="108" cy="70" r="2" className="anomaly-dot" />
        <text x="6" y="116">start</text>
        <text x="150" y="116">today</text>
        <text x="262" y="116">end</text>
      </svg>
    </Paper>
  );
}

function DetectedCard({
  view,
  advice,
  onSelect,
}: {
  view: HouseholdView;
  advice: Advice[];
  onSelect: (selection: ActiveSelection) => void;
}) {
  const detected = advice.find((item) => item.severity === "high" || item.severity === "warning") ?? advice[0];
  const categories = view.nodes.map((node) => node.category);

  return (
    <Paper withBorder radius="lg" p="md" className="panel-card">
      <Text fz="sm" c="dimmed" mb="sm">
        Detected · latest
      </Text>
      {detected ? (
        <Group className="detected-item" gap="sm" align="center">
          <AlertTriangle size={18} />
          <Box>
            <Text fz="sm" fw={600}>
              {detected.title}
            </Text>
            <Text fz="xs" c="dimmed">
              {detected.category.replace("_", " ")} · {detected.severity}
            </Text>
          </Box>
        </Group>
      ) : (
        <Text c="dimmed" fz="sm">
          No detected issues.
        </Text>
      )}
      <Group gap={6} mt="md">
        {categories.map((category) => (
          <Badge
            key={category}
            className={`category-pill cat-${category}`}
            variant="light"
            radius="xl"
            onClick={() => {
              const node = view.nodes.find((item) => item.category === category);
              if (node?.device_id != null) onSelect({ type: "device", deviceId: node.device_id });
            }}
          >
            {category.replace("_", " ")}
          </Badge>
        ))}
      </Group>
      <Text fz={11} c="dimmed" mt="sm">
        Missing devices auto-hide for households without EV, battery, or heat pump.
      </Text>
    </Paper>
  );
}

function AdviceList({ advice, onAction }: { advice: Advice[]; onAction: (actionType: string) => void }) {
  if (!advice.length)
    return (
      <Text c="dimmed" fs="italic" fz="sm">
        No advice for this selection.
      </Text>
    );

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
      {advice.map((item) => (
        <Card key={item.fact_key} withBorder radius="md" padding="md" className="advice-card">
          <Group gap="xs" mb={6} wrap="wrap">
            <Badge size="xs" variant="light" color={CATEGORY_COLOR[item.category] ?? "gray"} radius="xl">
              {item.category.replace("_", " ")}
            </Badge>
            {item.benefit_eur ? (
              <Badge size="xs" variant="light" color="green" radius="xl">
                save €{item.benefit_eur}/yr
              </Badge>
            ) : null}
          </Group>
          <Text fw={600} fz="sm">
            {item.title}
          </Text>
          <Text c="dimmed" fz="sm" mt={4} lineClamp={3}>
            {item.body}
          </Text>
          {item.action_type && (
            <Button mt="sm" size="compact-sm" variant="default" leftSection={<Zap size={14} />} onClick={() => onAction(item.action_type as string)}>
              {item.action_label || "Take action"}
            </Button>
          )}
        </Card>
      ))}
    </SimpleGrid>
  );
}

function ActionLog({ items }: { items: ActionLogItem[] }) {
  if (!items.length) return null;
  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Alert
          key={item.id}
          variant="light"
          color={item.status === "failed" ? "red" : "green"}
          icon={item.status === "failed" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          p="sm"
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text fz="sm">{item.message}</Text>
            {item.savings && item.savings > 0 ? (
              <Text fz="sm" fw={600} c="green.7">
                ~€{item.savings}/yr
              </Text>
            ) : null}
          </Group>
        </Alert>
      ))}
    </Stack>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
