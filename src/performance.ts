import { onCLS, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

type Reading = { value: number; rating: string; unit: string };
declare global {
  interface Window {
    __winddeskMetrics?: Partial<Record<string, Reading>>;
  }
}

// Opt-in local diagnostics only. Nothing is transmitted or persisted.
export function startPerformanceMeasurement() {
  if (window.__winddeskMetrics) return;
  window.__winddeskMetrics = {};
  const record = (metric: Metric) => {
    window.__winddeskMetrics![metric.name] = {
      value: metric.value,
      rating: metric.rating,
      unit: metric.name === "CLS" ? "score" : "ms",
    };
  };
  onLCP(record, { reportAllChanges: true });
  onCLS(record, { reportAllChanges: true });
  onINP(record, { reportAllChanges: true, durationThreshold: 16 });
  onTTFB(record);
}
