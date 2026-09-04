import type { CourseAnalytics } from "@/lib/course-analytics";
export function MonthlyCourseChart({ rows }: { rows: CourseAnalytics["monthly"] }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.applications, row.participants]));
  const ceiling = Math.ceil(max / 4) * 4;
  const x = (index: number) => rows.length === 1 ? 335 : 55 + index * 560 / (rows.length - 1);
  const y = (value: number) => 205 - value * 160 / ceiling;
  const ticks = new Set(Array.from({ length: Math.min(4, rows.length) }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, Math.min(4, rows.length) - 1))));
  return <figure className="course-analytics-chart"><figcaption><h3>Monthly applications and participants</h3><p>Grouped by application submission month, in Jamaica time.</p></figcaption>
    <div className="analytics-chart-legend"><span>Solid teal: participant records</span><span>Dashed gold: applications</span></div>
    <div className="analytics-chart-scroll" tabIndex={0} role="region" aria-label="Monthly chart; scroll horizontally on small screens"><svg viewBox="0 0 650 250" role="img" aria-label="Monthly applications and participant records. Exact values are in the monthly data table below.">
      {[0, 1, 2, 3, 4].map((step) => <g key={step}><line x1="55" x2="615" y1={y(step * ceiling / 4)} y2={y(step * ceiling / 4)} className="analytics-grid-line" /><text x="44" y={y(step * ceiling / 4) + 4} textAnchor="end">{step * ceiling / 4}</text></g>)}
      <polyline points={rows.map((row, index) => `${x(index)},${y(row.participants)}`).join(" ")} className="analytics-participant-line" />
      <polyline points={rows.map((row, index) => `${x(index)},${y(row.applications)}`).join(" ")} className="analytics-application-line" />
      {rows.map((row, index) => <g key={row.month}><circle cx={x(index)} cy={y(row.participants)} r="3" className="analytics-participant-dot" /><circle cx={x(index)} cy={y(row.applications)} r="3" className="analytics-application-dot" />{ticks.has(index) && <text x={x(index)} y="230" textAnchor="middle">{row.month}</text>}</g>)}
    </svg></div>
    <p className="analytics-scroll-hint">On narrow screens, scroll the chart horizontally or open the exact-value table below.</p>
    <details><summary>View monthly data table</summary><div className="analytics-table-scroll"><table><caption>Monthly totals for the applied dates</caption><thead><tr><th scope="col">Month</th><th scope="col">Applications</th><th scope="col">Participants</th></tr></thead><tbody>{rows.map((row) => <tr key={row.month}><th scope="row">{row.month}</th><td>{row.applications}</td><td>{row.participants}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
export function CourseCountBars({ title, values, unit }: { title: string; values: Record<string, number>; unit: string }) {
  const max = Math.max(1, ...Object.values(values));
  return <figure className="course-analytics-chart"><figcaption><h3>{title}</h3><p>{unit}</p></figcaption><ul className="analytics-bars">{Object.entries(values).map(([label, count]) => <li key={label}><div><span>{label.replaceAll("_", " ")}</span><strong>{count}</strong></div><svg viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="12" className="analytics-bar-track" /><rect width={400 * count / max} height="12" className="analytics-bar-fill" /></svg></li>)}</ul></figure>;
}
