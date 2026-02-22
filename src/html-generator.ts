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
    .call(g => g.select(".domain").attr("stroke","#555"))
    .selectAll("text").attr("fill","#aaa").attr("font-size","11px");
  svg.append("g").attr("transform", \`translate(0,\${height})\`)
    .call(d3.axisBottom(xScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","#555"))
    .selectAll("text").attr("fill","#aaa").attr("font-size","10px");
  svg.selectAll(".bar").data(data).join("rect")
    .attr("y", (_,i) => yScale(labels[i]) ?? 0)
    .attr("height", yScale.bandwidth()).attr("x", 0)
    .attr("width", 0).attr("rx", 4)
    .attr("fill", (_,i) => colors[i % colors.length]).attr("opacity", 0.85)
    .transition().duration(600).delay((_,i) => i * 50)
    .attr("width", (_,i) => xScale(values[i]));
  ` : `
  const xScale = d3.scaleBand().domain(labels).range([0, width]).padding(0.3);
  const yScale = d3.scaleLinear().domain([0, maxVal * 1.1]).range([height, 0]);
  svg.append("g").attr("transform", \`translate(0,\${height})\`)
    .call(d3.axisBottom(xScale).tickSize(0))
    .call(g => g.select(".domain").attr("stroke","#555"))
    .selectAll("text").attr("fill","#aaa").attr("font-size","10px")
    .attr("transform", labels.length > 6 ? "rotate(-30)" : "")
    .style("text-anchor", labels.length > 6 ? "end" : "middle");
  svg.append("g").call(d3.axisLeft(yScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","#555"))
    .selectAll("text").attr("fill","#aaa").attr("font-size","10px");
  svg.selectAll(".bar").data(data).join("rect")
    .attr("x", (_,i) => xScale(labels[i]) ?? 0)
    .attr("width", xScale.bandwidth()).attr("y", height).attr("height", 0)
    .attr("rx", 4).attr("fill", (_,i) => colors[i % colors.length]).attr("opacity", 0.85)
    .transition().duration(600).delay((_,i) => i * 50)
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
    .call(g => g.select(".domain").attr("stroke","#555"))
    .selectAll("text").attr("fill","#aaa").attr("font-size","10px");
  svg.append("g").call(d3.axisLeft(yScale).ticks(5))
    .call(g => g.select(".domain").attr("stroke","#555"))
    .selectAll("text").attr("fill","#aaa").attr("font-size","10px");

  const area = d3.area().x((_,i) => xScale(dates[i])).y0(height).y1((_,i) => yScale(values[i])).curve(d3.curveMonotoneX);
  svg.append("path").datum(d3.range(data.length)).attr("fill","rgba(96,165,250,0.1)").attr("d", area);

  const line = d3.line().x((_,i) => xScale(dates[i])).y((_,i) => yScale(values[i])).curve(d3.curveMonotoneX);
  const path = svg.append("path").datum(d3.range(data.length)).attr("fill","none").attr("stroke",lineColor).attr("stroke-width",2.5).attr("d", line);

  const totalLength = path.node().getTotalLength();
  path.attr("stroke-dasharray", totalLength + " " + totalLength)
    .attr("stroke-dashoffset", totalLength)
    .transition().duration(1000).ease(d3.easeQuadOut).attr("stroke-dashoffset", 0);

  svg.selectAll(".dot").data(data).join("circle")
    .attr("cx", (_,i) => xScale(dates[i]))
    .attr("cy", (_,i) => yScale(values[i]))
    .attr("r", 3.5).attr("fill", lineColor).attr("stroke","#1a1a2e").attr("stroke-width",2)
    .attr("opacity", 0).transition().delay(1000).duration(300).attr("opacity", 0.8);
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
    .attr("opacity", 0.85).attr("stroke","#1a1a2e").attr("stroke-width",2)
    .transition().duration(800)
    .attrTween("d", function(d) {
      const interp = d3.interpolate({startAngle:0, endAngle:0}, d);
      return t => arc(interp(t));
    });

  svg.append("text").attr("text-anchor","middle").attr("dy","-0.1em")
    .attr("fill","#e5e5e5").attr("font-size","20px").attr("font-weight","700")
    .text(total >= 1000 ? (total/1000).toFixed(1)+'k' : total.toLocaleString());
  svg.append("text").attr("text-anchor","middle").attr("dy","1.4em")
    .attr("fill","#888").attr("font-size","11px").text("Total");
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

export function generateDashboard(meta: AnalysisMeta): string {
  const scripts: string[] = [];

  const chartsHtml = meta.datasets
    .map((ds, i) => {
      if (ds.viz_hint === "table") {
        return `<div class="db-card"><div class="db-card-title">${escapeHtml(ds.name)}</div>${generateTableHtml(ds)}</div>`;
      }
      const script = generateChartScript(ds, i);
      if (script) scripts.push(script);
      return `<div class="db-card"><div class="db-card-title">${escapeHtml(ds.name)}</div><div id="chart-${i}" class="db-chart-container"></div></div>`;
    })
    .join("\n");

  const metricsHtml = meta.metrics
    .slice(0, 8)
    .map((m) => {
      const changeHtml = m.change != null
        ? `<span class="db-metric-change ${m.change >= 0 ? "positive" : "negative"}">${m.change >= 0 ? "+" : ""}${m.change}%</span>`
        : "";
      return `<div class="db-metric">
        <div class="db-metric-value">${m.unit && m.unit !== "%" ? `<span class="db-metric-unit">${escapeHtml(m.unit)}</span>` : ""}${formatValue(m.value)}${m.unit === "%" ? '<span class="db-metric-unit">%</span>' : ""}</div>
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
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  background: #0f0f1a;
  color: #e5e5e5;
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
  background: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12));
  border: 1px solid rgba(255,255,255,0.06);
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
  color: #aaa;
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
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}
.db-metric-value {
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 4px;
}
.db-metric-unit {
  font-size: 16px;
  font-weight: 600;
  color: #888;
  margin: 0 2px;
}
.db-metric-label {
  font-size: 12px;
  color: #888;
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
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 20px;
  overflow: hidden;
}
.db-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
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
  background: #1a1a2e;
  color: #888;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-weight: 600;
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.db-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: #ccc;
}
.db-table tr:hover td {
  background: rgba(255,255,255,0.02);
}
/* Dig Deeper */
.db-deeper {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 24px;
}
.db-deeper h3 {
  font-size: 14px;
  font-weight: 600;
  color: #888;
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
  color: #aaa;
  padding: 8px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
  border-left: 3px solid #60a5fa;
}
/* Footer */
.db-footer {
  text-align: center;
  margin-top: 32px;
  font-size: 11px;
  color: #555;
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

  ${meta.dig_deeper_prompts.length > 0 ? `<div class="db-deeper"><h3>Dig Deeper</h3><ul>${promptsHtml}</ul></div>` : ""}

  <div class="db-footer">Generated by Dashboard Bot &middot; Expires in 7 days</div>
</div>
<script>
${scripts.join("\n")}
<\/script>
</body>
</html>`;
}
