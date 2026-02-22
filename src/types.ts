export interface Metric {
  label: string;
  value: number;
  change?: number;
  unit?: string;
}

export interface Dataset {
  name: string;
  data: Record<string, unknown>[];
  viz_hint:
    | "bar"
    | "bar_horizontal"
    | "timeline"
    | "donut"
    | "force"
    | "sankey"
    | "treemap"
    | "table";
  x?: string;
  y?: string;
  color?: string;
}

export interface AnalysisMeta {
  title: string;
  domain: string;
  summary: string;
  metrics: Metric[];
  datasets: Dataset[];
  segments: string[];
  dig_deeper_prompts: string[];
}
