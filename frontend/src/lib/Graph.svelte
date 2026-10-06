<script>
  import cytoscape from "cytoscape";
  import { PATTERN, ROLE_LABEL, inr } from "./format.js";

  let { D, findingId = null, accountId = null, onselect } = $props();

  let el;
  let cy = null;
  const HUB_ROLES = new Set(["collector", "distributor", "source", "exit", "entry", "cycle_member", "layer"]);

  /** Deterministic layouts per typology, centred on (0,0) within roughly a 640px box. */
  function layout(f) {
    const pos = {};
    const ids = Object.keys(f.accounts);
    const m = f.metrics;
    if (f.type === "structuring") {
      pos[m.hub] = { x: 0, y: 0 };
      const spokes = ids.filter((a) => a !== m.hub);
      spokes.forEach((a, i) => {
        const ang = (i / spokes.length) * Math.PI * 2;
        const r = spokes.length > 40 ? (i % 2 ? 300 : 240) : 240;
        pos[a] = { x: r * Math.cos(ang), y: r * Math.sin(ang) };
      });
    } else if (f.type === "fan_out_fan_in") {
      pos[m.source] = { x: -300, y: 0 };
      pos[m.collector] = { x: 300, y: 0 };
      const mules = ids.filter((a) => a !== m.source && a !== m.collector);
      mules.forEach((a, i) => {
        const t = mules.length > 1 ? i / (mules.length - 1) : 0.5;
        pos[a] = { x: i % 2 ? 36 : -36, y: -420 + t * 840 };
      });
    } else if (f.type === "layering") {
      const c = m.chain;
      c.forEach((a, i) => (pos[a] = { x: (i - (c.length - 1) / 2) * 110, y: i % 2 ? 70 : -70 }));
    } else {
      m.ring.forEach((a, i) => {
        const ang = -Math.PI / 2 + (i / m.ring.length) * Math.PI * 2;
        pos[a] = { x: 170 * Math.cos(ang), y: 170 * Math.sin(ang) };
      });
    }
    return pos;
  }

  function build(fid) {
    const findings = fid ? [D.findingById.get(fid)] : D.findings;
    const nodes = new Map();
    const positions = {};
    const cols = Math.ceil(Math.sqrt(findings.length));
    findings.forEach((f, k) => {
      const ox = fid ? 0 : (k % cols) * 820, oy = fid ? 0 : Math.floor(k / cols) * 820;
      const pos = layout(f);
      for (const [id, role] of Object.entries(f.accounts)) {
        if (nodes.has(id)) continue;
        const n = D.nodeById.get(id);
        const hub = HUB_ROLES.has(role) && !(f.type === "layering" && role === "layer");
        nodes.set(id, {
          data: {
            id, role, risk: n?.risk ?? 0, color: PATTERN[f.type].color,
            label: hub || f.type === "layering" || f.type === "round_trip" ? `${id}\n${ROLE_LABEL[role]}` : "",
            shortLabel: id,
          },
          classes: [hub ? "hub" : "spoke", role].join(" "),
        });
        positions[id] = { x: pos[id].x + ox, y: pos[id].y + oy };
      }
    });
    const edges = D.edges
      .filter((e) => nodes.has(e.source) && nodes.has(e.target) && e.findings.some((x) => (fid ? x === fid : true)))
      .map((e) => {
        const f = D.findingById.get(e.findings[0]);
        const busy = f.type === "structuring" || f.type === "fan_out_fan_in";
        return {
          data: {
            id: `${e.source}>${e.target}`, source: e.source, target: e.target, color: PATTERN[f.type].color,
            w: Math.max(1, Math.min(6, Math.log10(e.total) - 2)),
            label: busy ? "" : e.count > 1 ? `${e.count}× · ${inr(e.total)}` : inr(e.total),
          },
        };
      });
    return { elements: [...nodes.values(), ...edges], positions };
  }

  const style = [
    { selector: "node", style: {
      "background-color": "data(color)", width: "mapData(risk, 0, 100, 14, 30)", height: "mapData(risk, 0, 100, 14, 30)",
      "border-width": 2, "border-color": "#ffffff", label: "data(label)", "font-size": 10, "font-family": "Inter, sans-serif",
      color: "#1f2937", "text-valign": "bottom", "text-margin-y": 4, "text-wrap": "wrap", "text-background-color": "#ffffff",
      "text-background-opacity": 0.85, "text-background-padding": 2, "text-background-shape": "roundrectangle" } },
    { selector: "node.hub", style: { width: 44, height: 44, "font-weight": 600, "font-size": 11 } },
    { selector: "node.collector, node.source, node.exit, node.distributor", style: { "border-color": "#0E1A2B", "border-width": 3 } },
    { selector: "edge", style: {
      width: "data(w)", "line-color": "data(color)", "target-arrow-color": "data(color)", "target-arrow-shape": "triangle",
      "arrow-scale": 0.8, "curve-style": "bezier", opacity: 0.55, label: "data(label)", "font-size": 9, color: "#334155",
      "text-background-color": "#ffffff", "text-background-opacity": 0.9, "text-background-padding": 2, "text-rotation": "autorotate" } },
    { selector: ".faded", style: { opacity: 0.12 } },
    { selector: "edge.lit", style: { opacity: 1, width: 3 } },
    { selector: "node.picked", style: { "border-color": "#111827", "border-width": 4, label: "data(shortLabel)", "z-index": 10 } },
  ];

  $effect(() => {
    const fid = findingId;
    if (!el) return;
    if (!cy) {
      cy = cytoscape({ container: el, style, minZoom: 0.05, maxZoom: 4, boxSelectionEnabled: false });
      cy.on("tap", "node", (e) => onselect?.(e.target.id()));
      cy.on("tap", (e) => e.target === cy && onselect?.(null));
    }
    const { elements, positions } = build(fid);
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "preset", positions: (n) => positions[n.id()], fit: true, padding: 40 }).run();
  });

  $effect(() => {
    const a = accountId;
    findingId; // re-apply after the graph is rebuilt
    if (!cy) return;
    cy.elements().removeClass("faded lit picked");
    if (!a) return;
    const n = cy.getElementById(a);
    if (!n.length) return;
    const hood = n.closedNeighborhood();
    cy.elements().not(hood).addClass("faded");
    n.addClass("picked");
    n.connectedEdges().addClass("lit");
  });

  export function fit() {
    cy?.animate({ fit: { padding: 40 } }, { duration: 300 });
  }
</script>

<div class="graph" bind:this={el}></div>

<style>
  .graph { position: absolute; inset: 0; }
</style>
