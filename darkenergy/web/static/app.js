// Dashboard live updates (SSE) + action buttons.
(function () {
  const dash = document.querySelector(".dash");
  if (!dash) return;
  const hid = dash.dataset.hid;

  // --- live telemetry via SSE ---
  const statusCard = document.getElementById("card-status");
  function setVal(key, value) {
    const el = statusCard && statusCard.querySelector(`[data-k="${key}"]`);
    if (!el || value === null || value === undefined) return;
    el.textContent = value;
    el.classList.remove("flash");
    void el.offsetWidth; // restart animation
    el.classList.add("flash");
  }

  const es = new EventSource(`/api/stream/${hid}`);
  const dot = document.getElementById("live-dot");
  es.onopen = () => dot && dot.classList.add("on");
  es.onerror = () => dot && dot.classList.remove("on");

  es.addEventListener("telemetry", (e) => {
    const d = JSON.parse(e.data);
    ["pv_production_kw", "total_consumption_kw", "grid_import_kw", "grid_export_kw",
     "battery_soc_pct", "price_eur_per_kwh", "outdoor_temp_c"].forEach((k) => setVal(k, d[k]));
    const tsEl = document.getElementById("status-ts");
    if (tsEl && d.ts) tsEl.textContent = d.ts.slice(11, 16);
  });

  es.addEventListener("action", (e) => {
    const d = JSON.parse(e.data);
    logAction(d.message, d.status, d.expected_savings_eur);
  });

  es.addEventListener("insight", (e) => {
    const d = JSON.parse(e.data);
    const feed = document.getElementById("insight-feed");
    if (!feed) return;
    const div = document.createElement("div");
    div.className = `insight sev-${d.severity || "info"}`;
    div.innerHTML = `<div class="insight-body"><h3></h3><p></p></div>`;
    div.querySelector("h3").textContent = d.title;
    div.querySelector("p").textContent = d.body;
    feed.prepend(div);
  });

  // --- actions ---
  const log = document.getElementById("action-log");
  function logAction(message, status, savings) {
    if (!log) return;
    const div = document.createElement("div");
    div.className = "action-result" + (status === "failed" ? " err" : "");
    div.textContent = message;
    if (savings && savings > 0) {
      const s = document.createElement("span");
      s.className = "savings";
      s.textContent = `  ~€${savings} / period`;
      div.appendChild(s);
    }
    log.prepend(div);
  }

  document.querySelectorAll(".act-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      btn.disabled = true;
      btn.textContent = "Working…";
      try {
        const resp = await fetch(`/api/actions/${action}?household_id=${hid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        if (!resp.ok) {
          logAction(data.detail || "Action not available", "failed");
        }
        // success is also delivered via SSE 'action' event
      } catch (err) {
        logAction("Network error running action", "failed");
      } finally {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || "Take action";
      }
    });
    btn.dataset.label = btn.textContent;
  });
})();
