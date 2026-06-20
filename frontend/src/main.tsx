import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Anchor,
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
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { ArrowLeft, ArrowRight, Bolt, CheckCircle2, Home, RotateCcw, TriangleAlert, Zap } from "lucide-react";
import { API_BASE_URL, getAdvice, getHouseholdView, listHouseholds, runAction } from "./api";
import type { ActionEvent, Advice, EnergyNode, Household, HouseholdView } from "./types";
import "@mantine/core/styles.css";
import "./styles.css";

const theme = createTheme({
  primaryColor: "energy",
  primaryShade: { light: 6, dark: 5 },
  autoContrast: true,
  defaultRadius: "md",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: { fontFamily: "Inter, sans-serif", fontWeight: "700" },
  colors: {
    energy: ["#e9fbf0", "#d3f9df", "#a8f0bf", "#79e89d", "#52e080", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#14532d"],
  },
});

type Route = { name: "home" } | { name: "household"; householdId: string };

type ActiveSelection = { type: "all" } | { type: "contract" } | { type: "device"; deviceId: number };

type ActionLogItem = { id: string; message: string; status: string; savings?: number | null };

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

const CATEGORY_COLOR: Record<string, string> = {
  device_choice: "energy",
  contract: "blue",
  utilization: "yellow",
  fault: "red",
};

const SEVERITY_COLOR: Record<string, string> = {
  high: "red",
  warning: "yellow",
  info: "gray",
};

function accentVar(advice: Advice): string {
  const sev = SEVERITY_COLOR[advice.severity];
  const color = sev && sev !== "gray" ? sev : CATEGORY_COLOR[advice.category] ?? "gray";
  return `var(--mantine-color-${color}-${color === "energy" ? 5 : 6})`;
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <Topbar />
      <Container size="lg" py="xl">
        {route.name === "home" ? <HouseholdPicker /> : <Dashboard householdId={route.householdId} />}
      </Container>
    </MantineProvider>
  );
}

function Topbar() {
  return (
    <Box component="header" className="topbar">
      <Container size="lg" h="100%">
        <Group h="100%" justify="space-between">
          <Group gap="xs" className="brand" onClick={() => navigate("/")} role="button">
            <ThemeIcon variant="light" color="energy" size="lg" radius="md">
              <Bolt size={18} />
            </ThemeIcon>
            <Text fw={800} fz="lg" lh={1}>
              Dark Energy
            </Text>
          </Group>
          <Text c="dimmed" fz="sm" visibleFrom="sm">
            Less cost. More loyalty. Zero disruption.
          </Text>
        </Group>
      </Container>
    </Box>
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
      <Group justify="space-between" align="baseline">
        <Title order={1} fz={28}>
          Households
        </Title>
        <Text c="dimmed" fz="sm">
          {status === "ready" ? `${households.length} active homes` : ""}
        </Text>
      </Group>

      {status === "loading" && (
        <Center py="xl">
          <Loader color="energy" />
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
            className="hover-lift"
            withBorder
            padding="lg"
            radius="md"
            onClick={() => navigate(`/h/${household.household_id}`)}
            role="button"
          >
            <Group justify="space-between" align="flex-start">
              <Badge variant="light" color="energy" radius="sm">
                {household.household_id}
              </Badge>
              <ThemeIcon variant="transparent" color="energy" size="sm">
                <Home size={16} />
              </ThemeIcon>
            </Group>
            <Text fw={700} fz="lg" mt="sm">
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

  const title = useMemo(() => {
    if (!view) return "Top recommendations";
    if (selection.type === "contract") return "Contract advice";
    if (selection.type === "device") {
      const node = view.nodes.find((item) => item.device_id === selection.deviceId);
      return node ? `${node.label} advice` : "Device advice";
    }
    return "Top recommendations";
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
        <Loader color="energy" />
      </Center>
    );
  if (error || !view)
    return (
      <Alert color="red" variant="light">
        {error || "Household not found."}
      </Alert>
    );

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Anchor c="dimmed" fz="sm" onClick={() => navigate("/")} component="button">
          <Group gap={6} component="span">
            <ArrowLeft size={14} /> homes
          </Group>
        </Anchor>
        <Title order={1} fz={30}>
          {view.household.name}
        </Title>
        <Text c="dimmed" fz="sm">
          {view.household.city} · {view.household.tariff_id} tariff
        </Text>
      </Stack>

      <div className="dash-grid">
        <EnergyDiagram view={view} selection={selection} onSelect={setSelection} />
        <Stack gap="md">
          <Group justify="space-between" align="center" mih={34}>
            <Title order={2} fz="lg">
              {title}
            </Title>
            {selection.type !== "all" && (
              <Button
                variant="default"
                size="compact-sm"
                leftSection={<RotateCcw size={14} />}
                onClick={() => setSelection({ type: "all" })}
              >
                All
              </Button>
            )}
          </Group>
          <AdviceList advice={advice} onAction={handleAction} />
          <ActionLog items={actionLog} />
        </Stack>
      </div>
    </Stack>
  );
}

function EnergyDiagram({
  view,
  selection,
  onSelect,
}: {
  view: HouseholdView;
  selection: ActiveSelection;
  onSelect: (selection: ActiveSelection) => void;
}) {
  const center = { x: 300, y: 230 };
  const radius = 165;
  const positions = view.nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(view.nodes.length, 1);
    return { node, x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });

  function isActive(node: EnergyNode): boolean {
    if (selection.type === "all") return false;
    if (selection.type === "contract") return node.kind === "contract";
    return node.device_id === selection.deviceId;
  }

  function selectNode(node: EnergyNode) {
    if (node.kind === "contract") onSelect({ type: "contract" });
    else if (node.device_id != null) onSelect({ type: "device", deviceId: node.device_id });
  }

  const solarCoverage =
    view.hub && view.hub.consumption_kwh > 0
      ? Math.min(100, Math.round((view.hub.pv_production_kwh / view.hub.consumption_kwh) * 100))
      : 0;

  return (
    <Paper withBorder radius="md" p="md" className="diagram-wrap">
      {view.hub && (
        <Group className="hub-summary" gap="lg" justify="center" wrap="nowrap">
          <RingProgress
            size={92}
            thickness={8}
            roundCaps
            sections={[{ value: solarCoverage, color: "energy" }]}
            label={
              <Text ta="center" fz="xs" fw={700}>
                {solarCoverage}%
                <Text component="span" c="dimmed" fz={9} display="block" lh={1}>
                  solar
                </Text>
              </Text>
            }
          />
          <Stack gap={2} align="flex-start">
            <Text fz={32} fw={800} lh={1}>
              €{formatEuro(view.hub.annual_cost_eur)}
              <Text component="span" c="dimmed" fz="sm" fw={400}>
                {" "}
                /yr
              </Text>
            </Text>
            <Group gap="md" c="dimmed" fz="xs">
              <span>{formatEuro(view.hub.consumption_kwh)} kWh used</span>
              <span>{formatEuro(view.hub.pv_production_kwh)} kWh solar</span>
            </Group>
          </Stack>
        </Group>
      )}
      <svg className="star" viewBox="0 0 600 460" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Household energy system">
        <defs>
          <radialGradient id="hubGrad" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#1c3326" />
            <stop offset="100%" stopColor="#16202c" />
          </radialGradient>
        </defs>
        {positions.map(({ node, x, y }) => (
          <line className={`connector ${isActive(node) ? "active" : ""}`} key={`line-${node.kind}-${node.device_id ?? node.category}`} x1={center.x} y1={center.y} x2={x} y2={y} />
        ))}
        <g className="node hub" onClick={() => onSelect({ type: "all" })} role="button" tabIndex={0}>
          <circle cx={center.x} cy={center.y} r="52" className="hub-circle" />
          <foreignObject x={center.x - 13} y={center.y - 22} width="26" height="26">
            <Home className="svg-icon" size={24} />
          </foreignObject>
          <text x={center.x} y={center.y + 18} className="node-sub">
            Home
          </text>
        </g>
        {positions.map(({ node, x, y }) => (
          <g
            className={`node devicenode ${isActive(node) ? "active" : ""}`}
            key={`${node.kind}-${node.device_id ?? node.category}`}
            onClick={() => selectNode(node)}
            role="button"
            tabIndex={0}
          >
            <circle cx={x} cy={y} r="38" className="node-circle" />
            <text x={x} y={y - 2} className="node-icon">
              {node.icon}
            </text>
            <text x={x} y={y + 17} className="node-sub">
              {node.label}
            </text>
            {node.metric && (
              <text x={x} y={y + 57} className="node-metric">
                {node.metric}
              </text>
            )}
          </g>
        ))}
      </svg>
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
    <Stack gap="sm">
      {advice.map((item) => (
        <Card key={item.fact_key} withBorder radius="md" padding="md" style={{ borderLeft: `3px solid ${accentVar(item)}` }}>
          <Group gap="xs" mb={6} wrap="wrap">
            <Badge size="xs" variant="light" color={CATEGORY_COLOR[item.category] ?? "gray"} radius="sm">
              {item.category.replace("_", " ")}
            </Badge>
            {item.benefit_eur ? (
              <Badge size="xs" variant="filled" color="energy" radius="sm">
                save €{item.benefit_eur}/yr
              </Badge>
            ) : null}
            {item.advice?.payback_years ? (
              <Text c="dimmed" fz="xs">
                ~{Math.round(item.advice.payback_years)}yr payback
              </Text>
            ) : null}
          </Group>
          <Title order={3} fz="md">
            {item.title}
          </Title>
          <Text c="dimmed" fz="sm" mt={4}>
            {item.body}
          </Text>
          {item.advice?.baseline_cost_eur != null && (
            <Group gap="xs" mt="sm" fz="sm" wrap="wrap">
              <Text c="dimmed" fz="sm">
                €{formatEuro(item.advice.baseline_cost_eur)}/yr now
              </Text>
              <ThemeIcon variant="transparent" color="energy" size="sm">
                <ArrowRight size={15} />
              </ThemeIcon>
              <Text fw={700} fz="sm">
                €{formatEuro(item.advice.counterfactual_cost_eur)}/yr
              </Text>
            </Group>
          )}
          {item.action_type && (
            <Button
              mt="md"
              size="sm"
              color="energy"
              leftSection={<Zap size={15} />}
              onClick={() => onAction(item.action_type as string)}
            >
              {item.action_label || "Take action"}
            </Button>
          )}
        </Card>
      ))}
    </Stack>
  );
}

function ActionLog({ items }: { items: ActionLogItem[] }) {
  if (!items.length) return null;
  return (
    <Stack gap="xs" mt="sm">
      {items.map((item) => (
        <Alert
          key={item.id}
          variant="light"
          color={item.status === "failed" ? "red" : "energy"}
          icon={item.status === "failed" ? <TriangleAlert size={16} /> : <CheckCircle2 size={16} />}
          p="sm"
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text fz="sm">{item.message}</Text>
            {item.savings && item.savings > 0 ? (
              <Text fz="sm" fw={700} c="energy">
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
