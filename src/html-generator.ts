import type { AnalysisMeta, Dataset } from "./types.js";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

function generateChartScript(dataset: Dataset, index: number): string {
  const containerId = `chart-${index}`;
  const data = JSON.stringify(dataset.data);
  const x = dataset.x || "x";
  const y = dataset.y || "y";

  switch (dataset.viz_hint) {
    case "bar":
    case "bar_horizontal":
      return generateBarScript(containerId, data, x, y, dataset.viz_hint === "bar_horizontal");
    case "timeline":
      return generateTimelineScript(containerId, data, x, y);
    case "donut":
      return generateDonutScript(containerId, data, x, y);
    case "treemap":
      return generateTreemapScript(containerId, data, x, y);
    case "table":
      return ""; // Tables are pure HTML, no script needed
    default:
      return "";
  }
}

function generateBarScript(id: string, data: string, x: string, y: string, horizontal: boolean): string {
  return `
(function() {
  const container = document.getElementById('${id}');
  const data = ${data};
  const margin = {top: 20, right: 20, bottom: 40, left: ${horizontal ? 100 : 50}};
  const width = container.clientWidth - margin.left - margin.right;
  const height = 260 - margin.top - margin.bottom;
  const colors = ["#60a5fa","#a78bfa","#34d399","#fbbf24","#f87171","#38bdf8"];

  const svg = d3.select(container).append("svg")
    .attr("viewBox", \`0 0 \${width + margin.left + margin.right} \${height + margin.top + margin.bottom}\`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g").attr("transform", \`translate(\${margin.left},\${margin.top})\`);

  const labels = data.map(d => String(d['${x}'] ?? ''));
  const values = data.map(d => Number(d['${y}'] ?? 0));
  const maxVal = d3.max(values) || 0;

  ${horizontal ? `
  const yScale = d3.scaleBand().domain(labels).range([0, height]).padding(0.3);
  const xScale = d3.scaleLinear().domain([0, maxVal * 1.1]).range([0, width]);
  svg.append("g").call(d3.axisLeft(yScale).tickSize(0))
    .call(g => g.select(".domain").attr("stroke","var(--chart-domain)"))
    .selectAll("text").attr("fill","var(--chart-text)").attr("font-size","11px");
  svg.append("g").attr("transform", \`translate(0,\${height})\`)
    .call(d3.axisBottom(xScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","var(--chart-domain)"))
    .selectAll("text").attr("fill","var(--chart-text)").attr("font-size","10px");
  const bars = svg.selectAll(".bar").data(data).join("rect")
    .attr("y", (_,i) => yScale(labels[i]) ?? 0)
    .attr("height", yScale.bandwidth()).attr("x", 0)
    .attr("width", 0).attr("rx", 4)
    .attr("fill", (_,i) => colors[i % colors.length]).attr("opacity", 0.85)
    .style("cursor", "pointer")
    .on("mouseover", function(evt,d,i) { d3.select(this).attr("opacity",1); const idx = data.indexOf(d); showTooltip(evt, '<strong>'+labels[idx]+'</strong><br>'+values[idx].toLocaleString()); })
    .on("mousemove", function(evt) { showTooltip(evt, tooltip.innerHTML); })
    .on("mouseout", function() { d3.select(this).attr("opacity",0.85); hideTooltip(); });
  bars.transition().duration(600).delay((_,i) => i * 50)
    .attr("width", (_,i) => xScale(values[i]));
  ` : `
  const xScale = d3.scaleBand().domain(labels).range([0, width]).padding(0.3);
  const yScale = d3.scaleLinear().domain([0, maxVal * 1.1]).range([height, 0]);
  svg.append("g").attr("transform", \`translate(0,\${height})\`)
    .call(d3.axisBottom(xScale).tickSize(0))
    .call(g => g.select(".domain").attr("stroke","var(--chart-domain)"))
    .selectAll("text").attr("fill","var(--chart-text)").attr("font-size","10px")
    .attr("transform", labels.length > 6 ? "rotate(-30)" : "")
    .style("text-anchor", labels.length > 6 ? "end" : "middle");
  svg.append("g").call(d3.axisLeft(yScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","var(--chart-domain)"))
    .selectAll("text").attr("fill","var(--chart-text)").attr("font-size","10px");
  const bars = svg.selectAll(".bar").data(data).join("rect")
    .attr("x", (_,i) => xScale(labels[i]) ?? 0)
    .attr("width", xScale.bandwidth()).attr("y", height).attr("height", 0)
    .attr("rx", 4).attr("fill", (_,i) => colors[i % colors.length]).attr("opacity", 0.85)
    .style("cursor", "pointer")
    .on("mouseover", function(evt,d) { d3.select(this).attr("opacity",1); const idx = data.indexOf(d); showTooltip(evt, '<strong>'+labels[idx]+'</strong><br>'+values[idx].toLocaleString()); })
    .on("mousemove", function(evt) { showTooltip(evt, tooltip.innerHTML); })
    .on("mouseout", function() { d3.select(this).attr("opacity",0.85); hideTooltip(); });
  bars.transition().duration(600).delay((_,i) => i * 50)
    .attr("y", (_,i) => yScale(values[i]))
    .attr("height", (_,i) => height - yScale(values[i]));
  `}
})();`;
}

function generateTimelineScript(id: string, data: string, x: string, y: string): string {
  return `
(function() {
  const container = document.getElementById('${id}');
  const data = ${data};
  const margin = {top: 20, right: 20, bottom: 40, left: 50};
  const width = container.clientWidth - margin.left - margin.right;
  const height = 260 - margin.top - margin.bottom;
  const lineColor = "#60a5fa";

  const svg = d3.select(container).append("svg")
    .attr("viewBox", \`0 0 \${width + margin.left + margin.right} \${height + margin.top + margin.bottom}\`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g").attr("transform", \`translate(\${margin.left},\${margin.top})\`);

  const dates = data.map(d => new Date(String(d['${x}'])));
  const values = data.map(d => Number(d['${y}'] ?? 0));

  const xScale = d3.scaleTime().domain(d3.extent(dates)).range([0, width]);
  const yScale = d3.scaleLinear().domain([0, (d3.max(values) || 0) * 1.1]).range([height, 0]);

  svg.append("g").attr("transform", \`translate(0,\${height})\`)
    .call(d3.axisBottom(xScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","var(--chart-domain)"))
    .selectAll("text").attr("fill","var(--chart-text)").attr("font-size","10px");
  svg.append("g").call(d3.axisLeft(yScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","var(--chart-domain)"))
    .selectAll("text").attr("fill","var(--chart-text)").attr("font-size","10px");

  // Gradient area fill
  const gradId = '${id}-grad';
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", gradId).attr("x1","0").attr("y1","0").attr("x2","0").attr("y2","1");
  grad.append("stop").attr("offset","0%").attr("stop-color",lineColor).attr("stop-opacity",0.3);
  grad.append("stop").attr("offset","100%").attr("stop-color",lineColor).attr("stop-opacity",0.02);

  const area = d3.area().x((_,i) => xScale(dates[i])).y0(height).y1((_,i) => yScale(values[i])).curve(d3.curveMonotoneX);
  svg.append("path").datum(d3.range(data.length)).attr("fill",\`url(#\${gradId})\`).attr("d", area);

  const line = d3.line().x((_,i) => xScale(dates[i])).y((_,i) => yScale(values[i])).curve(d3.curveMonotoneX);
  const path = svg.append("path").datum(d3.range(data.length)).attr("fill","none").attr("stroke",lineColor).attr("stroke-width",2.5).attr("d", line);

  const totalLength = path.node().getTotalLength();
  path.attr("stroke-dasharray", totalLength + " " + totalLength)
    .attr("stroke-dashoffset", totalLength)
    .transition().duration(1000).ease(d3.easeQuadOut).attr("stroke-dashoffset", 0);

  // Glow filter
  const filter = defs.append("filter").attr("id","${id}-glow");
  filter.append("feGaussianBlur").attr("stdDeviation","3").attr("result","blur");
  filter.append("feMerge").html('<feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/>');

  svg.selectAll(".dot").data(data).join("circle")
    .attr("cx", (_,i) => xScale(dates[i]))
    .attr("cy", (_,i) => yScale(values[i]))
    .attr("r", 4).attr("fill", lineColor).attr("stroke","var(--donut-stroke)").attr("stroke-width",2)
    .attr("filter","url(#${id}-glow)")
    .style("cursor","pointer")
    .on("mouseover", function(evt,d) {
      d3.select(this).transition().duration(150).attr("r",7);
      const idx = data.indexOf(d);
      const dateStr = dates[idx].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      showTooltip(evt, '<strong>'+dateStr+'</strong><br>'+values[idx].toLocaleString());
    })
    .on("mousemove", function(evt) { showTooltip(evt, tooltip.innerHTML); })
    .on("mouseout", function() { d3.select(this).transition().duration(150).attr("r",4); hideTooltip(); })
    .attr("opacity", 0).transition().delay(1000).duration(300).attr("opacity", 0.9);
})();`;
}

function generateDonutScript(id: string, data: string, x: string, y: string): string {
  return `
(function() {
  const container = document.getElementById('${id}');
  const data = ${data};
  const size = Math.min(container.clientWidth, 280);
  const radius = size / 2;
  const innerRadius = radius * 0.55;
  const colors = ["#60a5fa","#a78bfa","#34d399","#fbbf24","#f87171","#38bdf8","#c084fc","#4ade80"];

  const svg = d3.select(container).append("svg")
    .attr("viewBox", \`0 0 \${size} \${size}\`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g").attr("transform", \`translate(\${radius},\${radius})\`);

  const values = data.map(d => Math.abs(Number(d['${y}'] ?? 0)));
  const labels = data.map(d => String(d['${x}'] ?? ''));
  const total = d3.sum(values);

  const pie = d3.pie().sort(null).padAngle(0.02);
  const arc = d3.arc().innerRadius(innerRadius).outerRadius(radius - 4);

  svg.selectAll(".arc").data(pie(values)).join("path")
    .attr("fill", (_,i) => colors[i % colors.length])
    .attr("opacity", 0.85).attr("stroke","var(--donut-stroke)").attr("stroke-width",2)
    .style("cursor","pointer")
    .on("mouseover", function(evt,d) {
      d3.select(this).attr("opacity",1).attr("transform","scale(1.04)");
      const idx = d.index;
      const pct = ((values[idx]/total)*100).toFixed(1);
      showTooltip(evt, '<strong>'+labels[idx]+'</strong><br>'+values[idx].toLocaleString()+' ('+pct+'%)');
    })
    .on("mousemove", function(evt) { showTooltip(evt, tooltip.innerHTML); })
    .on("mouseout", function() { d3.select(this).attr("opacity",0.85).attr("transform","scale(1)"); hideTooltip(); })
    .transition().duration(800)
    .attrTween("d", function(d) {
      const interp = d3.interpolate({startAngle:0, endAngle:0}, d);
      return t => arc(interp(t));
    });

  const centerText = svg.append("text").attr("text-anchor","middle").attr("dy","-0.1em")
    .attr("fill","var(--metric-value)").attr("font-size","20px").attr("font-weight","700");
  // Animated center counter
  const fmt = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'k' : Math.round(v).toLocaleString();
  centerText.transition().duration(1000).tween("text", function() {
    const i = d3.interpolateNumber(0, total);
    return t => { this.textContent = fmt(i(t)); };
  });
  svg.append("text").attr("text-anchor","middle").attr("dy","1.4em")
    .attr("fill","var(--text-subtle)").attr("font-size","11px").text("Total");
})();`;
}

function generateTreemapScript(id: string, data: string, x: string, y: string): string {
  return `
(function() {
  const container = document.getElementById('${id}');
  const data = ${data};
  const width = container.clientWidth;
  const height = 300;
  const colors = ["#60a5fa","#a78bfa","#34d399","#fbbf24","#f87171","#38bdf8","#c084fc","#4ade80"];

  const svg = d3.select(container).append("svg")
    .attr("viewBox", \`0 0 \${width} \${height}\`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const root = d3.hierarchy({children: data.map(d => ({name: String(d['${x}']??''), value: Math.abs(Number(d['${y}']??0))}))})
    .sum(d => d.value || 0).sort((a,b) => (b.value||0) - (a.value||0));

  d3.treemap().size([width, height]).paddingInner(2).paddingOuter(3).round(true)(root);

  const cells = svg.selectAll("g").data(root.leaves()).join("g")
    .attr("transform", d => \`translate(\${d.x0},\${d.y0})\`);

  cells.append("rect")
    .attr("width", d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", (_,i) => colors[i % colors.length])
    .attr("rx", 4).attr("opacity", 0)
    .style("cursor","pointer")
    .on("mouseover", function(evt,d) {
      d3.select(this).attr("opacity",1);
      const totalVal = d3.sum(root.leaves(), l => l.value);
      const pct = ((d.value/totalVal)*100).toFixed(1);
      showTooltip(evt, '<strong>'+d.data.name+'</strong><br>'+d.data.value.toLocaleString()+' ('+pct+'%)');
    })
    .on("mousemove", function(evt) { showTooltip(evt, tooltip.innerHTML); })
    .on("mouseout", function() { d3.select(this).attr("opacity",0.85); hideTooltip(); })
    .transition().duration(600).delay((_,i) => i * 30).attr("opacity", 0.85);

  cells.append("text").attr("x",6).attr("y",16).attr("fill","#fff")
    .attr("font-size","11px").attr("font-weight","600")
    .text(d => { const w = d.x1 - d.x0; const n = d.data.name; return w > 60 ? (n.length > w/8 ? n.slice(0,Math.floor(w/8))+'…' : n) : ''; });
  cells.append("text").attr("x",6).attr("y",30).attr("fill","rgba(255,255,255,0.7)")
    .attr("font-size","10px")
    .text(d => (d.x1 - d.x0) > 50 ? d.data.value : '');
})();`;
}

function generateTableHtml(dataset: Dataset): string {
  const data = dataset.data;
  if (!data.length) return "";
  const cols = Object.keys(data[0]);
  const rows = data.slice(0, 30);
  return `
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

export type Theme = "dark" | "light";

export function generateDashboard(meta: AnalysisMeta, theme: Theme = "dark"): string {
  const scripts: string[] = [];

  const chartsHtml = meta.datasets
    .map((ds, i) => {
      if (ds.viz_hint === "table") {
        return `<div class="db-card reveal"><div class="db-card-title">${escapeHtml(ds.name)}</div>${generateTableHtml(ds)}</div>`;
      }
      const script = generateChartScript(ds, i);
      if (script) scripts.push(script);
      return `<div class="db-card reveal"><div class="db-card-title">${escapeHtml(ds.name)}</div><div id="chart-${i}" class="db-chart-container"></div></div>`;
    })
    .join("\n");

  const metricsHtml = meta.metrics
    .slice(0, 8)
    .map((m) => {
      const changeHtml = m.change != null
        ? `<span class="db-metric-change ${m.change >= 0 ? "positive" : "negative"}">${m.change >= 0 ? "+" : ""}${m.change}%</span>`
        : "";
      const prefix = m.unit && m.unit !== "%" ? `<span class="db-metric-unit">${escapeHtml(m.unit)}</span>` : "";
      const suffix = m.unit === "%" ? '<span class="db-metric-unit">%</span>' : "";
      return `<div class="db-metric reveal">
        <div class="db-metric-value">${prefix}<span class="countup" data-target="${m.value}">0</span>${suffix}</div>
        <div class="db-metric-label">${escapeHtml(m.label)}${changeHtml}</div>
      </div>`;
    })
    .join("\n");

  const promptsHtml = meta.dig_deeper_prompts
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(meta.title)}</title>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<style>
:root {
  --bg: ${theme === "dark" ? "#0f0f1a" : "#f5f5f7"};
  --text: ${theme === "dark" ? "#e5e5e5" : "#1a1a2e"};
  --text-muted: ${theme === "dark" ? "#aaa" : "#666"};
  --text-subtle: ${theme === "dark" ? "#888" : "#999"};
  --card-bg: ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"};
  --card-border: ${theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"};
  --hero-grad: ${theme === "dark" ? "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))" : "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))"};
  --metric-value: ${theme === "dark" ? "#fff" : "#1a1a2e"};
  --chart-text: ${theme === "dark" ? "#aaa" : "#666"};
  --chart-domain: ${theme === "dark" ? "#555" : "#ccc"};
  --table-header-bg: ${theme === "dark" ? "#1a1a2e" : "#eee"};
  --table-hover: ${theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"};
  --deeper-border: ${theme === "dark" ? "#60a5fa" : "#3b82f6"};
  --donut-stroke: ${theme === "dark" ? "#1a1a2e" : "#f5f5f7"};
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
.db-wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px;
}
/* Hero */
.db-hero {
  margin-bottom: 32px;
  padding: 32px;
  background: var(--hero-grad);
  border: 1px solid var(--card-border);
  border-radius: 16px;
}
.db-hero-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.db-hero-title {
  font-size: 28px;
  font-weight: 800;
  background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.db-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(96,165,250,0.15);
  color: #60a5fa;
  border: 1px solid rgba(96,165,250,0.2);
}
.db-summary {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 700px;
}
/* Metrics */
.db-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}
.db-metric {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}
.db-metric-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--metric-value);
  margin-bottom: 4px;
}
.db-metric-unit {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-subtle);
  margin: 0 2px;
}
.db-metric-label {
  font-size: 12px;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.db-metric-change {
  font-size: 11px;
  font-weight: 600;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 8px;
}
.db-metric-change.positive { background: rgba(52,211,153,0.15); color: #34d399; }
.db-metric-change.negative { background: rgba(248,113,113,0.15); color: #f87171; }
/* Charts */
.db-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}
.db-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px;
  overflow: hidden;
}
.db-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 16px;
}
.db-chart-container {
  width: 100%;
  min-height: 260px;
}
/* Table */
.db-table-wrap {
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}
.db-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.db-table th {
  position: sticky;
  top: 0;
  background: var(--table-header-bg);
  color: var(--text-subtle);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-weight: 600;
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--card-border);
}
.db-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--card-border);
  color: var(--text-muted);
}
.db-table tr:hover td {
  background: var(--table-hover);
}
/* Dig Deeper */
.db-deeper {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 24px;
}
.db-deeper h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}
.db-deeper ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.db-deeper li {
  font-size: 14px;
  color: var(--text-muted);
  padding: 8px 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border-left: 3px solid var(--deeper-border);
}
/* Tooltip */
.db-tooltip {
  position: fixed;
  pointer-events: none;
  background: ${theme === "dark" ? "rgba(20,20,40,0.95)" : "rgba(255,255,255,0.95)"};
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  backdrop-filter: blur(8px);
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.15s;
  max-width: 200px;
}
.db-tooltip.visible { opacity: 1; }
.db-tooltip strong { color: var(--metric-value); }
/* Scroll reveal */
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
/* Card hover */
.db-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.db-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px ${theme === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.08)"};
}
.db-metric {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.db-metric:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px ${theme === "dark" ? "rgba(96,165,250,0.15)" : "rgba(59,130,246,0.1)"};
}
/* Footer */
.db-footer {
  text-align: center;
  margin-top: 32px;
  font-size: 11px;
  color: var(--text-subtle);
}
@media (max-width: 600px) {
  .db-wrap { padding: 16px; }
  .db-hero { padding: 20px; }
  .db-hero-title { font-size: 22px; }
  .db-charts { grid-template-columns: 1fr; }
  .db-metrics { grid-template-columns: repeat(2, 1fr); }
}
</style>
</head>
<body>
<div class="db-wrap">
  <div class="db-hero">
    <div class="db-hero-header">
      <h1 class="db-hero-title">${escapeHtml(meta.title)}</h1>
      <span class="db-badge">${escapeHtml(meta.domain)}</span>
    </div>
    <p class="db-summary">${escapeHtml(meta.summary)}</p>
  </div>

  <div class="db-metrics">${metricsHtml}</div>

  <div class="db-charts">${chartsHtml}</div>

  ${meta.dig_deeper_prompts.length > 0 ? `<div class="db-deeper reveal"><h3>Dig Deeper</h3><ul>${promptsHtml}</ul></div>` : ""}

  <div class="db-footer">Generated by Dashboard Bot &middot; Expires in 7 days</div>
</div>
<div class="db-tooltip" id="tooltip"></div>
<script>
// ── Tooltip helper ──
const tooltip = document.getElementById('tooltip');
window.showTooltip = function(evt, html) {
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  tooltip.style.left = (evt.clientX + 12) + 'px';
  tooltip.style.top = (evt.clientY - 10) + 'px';
};
window.hideTooltip = function() {
  tooltip.classList.remove('visible');
};

// ── Count-up animation ──
function animateCountUp(el) {
  const target = parseFloat(el.dataset.target);
  const duration = 1200;
  const start = performance.now();
  const format = (v) => {
    if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1) + 'k';
    return Number.isInteger(target) ? Math.round(v).toLocaleString('en-US') : v.toFixed(1);
  };
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = format(target * ease);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = format(target);
  }
  requestAnimationFrame(tick);
}

// ── Scroll reveal + countup trigger ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      entry.target.querySelectorAll('.countup').forEach(el => {
        if (!el.dataset.animated) {
          el.dataset.animated = '1';
          animateCountUp(el);
        }
      });
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── Charts ──
${scripts.join("\n")}
<\/script>
</body>
</html>`;
}
