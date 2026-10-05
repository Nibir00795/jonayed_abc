import Head from "next/head";
import Script from "next/script";
import { useState, useEffect, useRef, useMemo } from "react";
import styles from "./index.module.css";

const AUTHOR = "Md Jonayed Hossain Chowdhury";
const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";
const PREVIEW_ROWS = 8;

// A small, clearly synthetic dataset so the live app demonstrates itself
// without the visitor needing a file to hand.
const SAMPLE_CSV = `month,region,units_sold,returns,avg_price_usd
2025-01,North,412,18,24.5
2025-02,North,398,21,24.5
2025-03,North,455,16,25.0
2025-04,North,501,19,25.0
2025-05,North,548,22,25.5
2025-06,North,590,25,25.5
2025-01,South,287,9,23.0
2025-02,South,301,11,23.0
2025-03,South,340,10,23.5
2025-04,South,362,14,23.5
2025-05,South,410,13,24.0
2025-06,South,447,17,24.0`;

// ---------- CSV parsing: handles quoted fields, embedded commas and newlines ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v.trim() !== "")) rows.push(row); }
  if (rows.length < 2) throw new Error("The file needs a header row and at least one data row.");
  const header = rows[0].map((h, i) => (h.trim() || `column_${i + 1}`));
  const data = rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
  return { columns: header, rows: data };
}

const asNumber = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function inferTypes(columns, rows) {
  const types = {};
  for (const c of columns) {
    const vals = rows.map((r) => r[c]).filter((v) => v !== "");
    const numeric = vals.filter((v) => asNumber(v) !== null).length;
    types[c] = vals.length && numeric / vals.length >= 0.9 ? "number" : "text";
  }
  return types;
}

export default function Home() {
  const [plotlyReady, setPlotlyReady] = useState(false);
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState({});
  const [xCol, setXCol] = useState("");
  const [yCols, setYCols] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [loadError, setLoadError] = useState("");
  const [model, setModel] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const chartRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Plotly) setPlotlyReady(true);
    fetch("/api/generate?endpoint=config").then((r) => r.json()).then((d) => setModel(d.model || "")).catch(() => {});
  }, []);

  const numericCols = useMemo(() => columns.filter((c) => types[c] === "number"), [columns, types]);

  // ---------- loading data ----------
  const loadText = (text, name) => {
    try {
      const parsed = parseCSV(text);
      const t = inferTypes(parsed.columns, parsed.rows);
      const nums = parsed.columns.filter((c) => t[c] === "number");
      const firstText = parsed.columns.find((c) => t[c] !== "number");
      setColumns(parsed.columns);
      setRows(parsed.rows);
      setTypes(t);
      setXCol(firstText || parsed.columns[0]);
      setYCols(nums.slice(0, 1));
      setFileName(name);
      setLoadError("");
      setAiReply("");
    } catch (e) {
      setLoadError(e.message || String(e));
    }
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result), file.name);
    reader.onerror = () => setLoadError("Could not read that file.");
    reader.readAsText(file);
  };

  const clearAll = () => {
    setColumns([]); setRows([]); setTypes({}); setXCol(""); setYCols([]);
    setFileName(""); setLoadError(""); setAiReply("");
    if (chartRef.current && window.Plotly) window.Plotly.purge(chartRef.current);
  };

  // ---------- drawing ----------
  useEffect(() => {
    if (!plotlyReady || !chartRef.current || !rows.length || !xCol || !yCols.length) return;
    const xIsNumber = types[xCol] === "number";
    let data = rows.map((r) => ({ x: xIsNumber ? asNumber(r[xCol]) : r[xCol], r }));
    if (chartType === "line" || chartType === "scatter") {
      data = [...data].sort((a, b) => (a.x > b.x ? 1 : a.x < b.x ? -1 : 0));
    }
    const palette = ["#2f6f8f", "#d7792b", "#5b8c5a", "#8c5b7a", "#7a7a52", "#4b6b9a"];
    const traces = yCols.map((y, i) => ({
      type: chartType === "line" ? "scatter" : chartType,
      mode: chartType === "line" ? "lines+markers" : chartType === "scatter" ? "markers" : undefined,
      name: y,
      x: data.map((d) => d.x),
      y: data.map((d) => asNumber(d.r[y])),
      marker: { color: palette[i % palette.length] },
      line: { color: palette[i % palette.length], width: 2 },
    }));
    const layout = {
      title: { text: `${yCols.join(", ")} by ${xCol}`, x: 0, xanchor: "left", font: { size: 16, color: "#1d2b33" } },
      paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff",
      font: { family: "ui-sans-serif, -apple-system, Segoe UI, Helvetica, Arial, sans-serif", color: "#65717a", size: 13 },
      xaxis: { title: { text: xCol }, showgrid: false, linecolor: "#dcdcd6", type: xIsNumber ? "linear" : "category" },
      yaxis: { title: { text: yCols.length === 1 ? yCols[0] : "value" }, gridcolor: "#eeeeea", zerolinecolor: "#dcdcd6", rangemode: chartType === "bar" ? "tozero" : "normal" },
      barmode: "group",
      legend: { orientation: "h", y: 1.12, x: 0, xanchor: "left" },
      margin: { l: 64, r: 20, t: 70, b: 60 },
      hovermode: "closest",
    };
    window.Plotly.newPlot(chartRef.current, traces, layout, { displayModeBar: false, responsive: true });
  }, [plotlyReady, rows, xCol, yCols, chartType, types]);

  // ---------- Chart Doctor ----------
  const askChartDoctor = async () => {
    if (!rows.length || aiBusy) return;
    setAiBusy(true);
    setAiReply("");
    const sample = rows.slice(0, 5).map((r) => columns.map((c) => `${c}=${r[c]}`).join(", ")).join("\n");
    const summary = [
      `Dataset: ${fileName || "sample"}, ${rows.length} rows, ${columns.length} columns.`,
      `Columns and types: ${columns.map((c) => `${c} (${types[c]})`).join("; ")}.`,
      `First rows:\n${sample}`,
      `Chart I drew: ${chartType} chart, x = ${xCol}, y = ${yCols.join(" and ")}.`,
      `Diagnose this chart and tell me the most useful fix.`,
    ].join("\n");
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: summary }] }),
      });
      if (!resp.ok && !resp.body) throw new Error(`Server returned ${resp.status}.`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setAiReply(text);
      }
      if (!text.trim()) setAiReply("[Chart Doctor error] Empty reply. Check the terminal running the server.");
    } catch (e) {
      setAiReply(`[Chart Doctor error] ${e.message || String(e)}`);
    } finally {
      setAiBusy(false);
    }
  };

  const toggleY = (c) => setYCols((prev) => (prev.includes(c) ? prev.filter((v) => v !== c) : [...prev, c]));
  const hasData = rows.length > 0;

  return (
    <div className={styles.page}>
      <Head>
        <title>Chart Doctor: upload data, see it, fix it</title>
        <meta name="description" content="Upload a CSV, chart it in the browser, and let an AI critic diagnose the chart." />
      </Head>
      <Script src={PLOTLY_CDN} strategy="afterInteractive" onLoad={() => setPlotlyReady(true)} />

      <header className={styles.header}>
        <svg className={styles.icon} viewBox="0 0 48 48" role="img" aria-label="Chart Doctor">
          <rect x="4" y="26" width="7" height="16" rx="1.5" fill="#2f6f8f" />
          <rect x="14" y="18" width="7" height="24" rx="1.5" fill="#2f6f8f" />
          <rect x="24" y="30" width="7" height="12" rx="1.5" fill="#d7792b" />
          <circle cx="33" cy="17" r="10" fill="none" stroke="#1d2b33" strokeWidth="3" />
          <line x1="40" y1="24" x2="46" y2="30" stroke="#1d2b33" strokeWidth="3" strokeLinecap="round" />
          <line x1="29" y1="17" x2="37" y2="17" stroke="#d7792b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="33" y1="13" x2="33" y2="21" stroke="#d7792b" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div>
          <h1 className={styles.title}>Chart Doctor</h1>
          <p className={styles.subtitle}>Upload a CSV, see it as a chart, then ask what is wrong with the chart.</p>
        </div>
      </header>

      <p className={styles.byline}>
        Built by <strong>{AUTHOR}</strong>
        {model ? <span className={styles.model}>model: {model}</span> : null}
      </p>

      {/* 2a: a way to upload custom data */}
      <section className={styles.panel}>
        <div className={styles.uploadRow}>
          <label className={styles.upload}>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            <span>Upload a CSV file</span>
          </label>
          <button type="button" className={styles.ghost} onClick={() => loadText(SAMPLE_CSV, "sample_sales.csv")}>
            Load sample data
          </button>
          {hasData ? <button type="button" className={styles.ghost} onClick={clearAll}>Clear</button> : null}
        </div>
        {loadError ? <div className={styles.error}>{loadError}</div> : null}
        {hasData ? (
          <p className={styles.meta}>
            <strong>{fileName}</strong>: {rows.length.toLocaleString()} rows, {columns.length} columns.
            Numeric columns: {numericCols.length ? numericCols.join(", ") : "none found"}.
          </p>
        ) : (
          <p className={styles.meta}>The file is parsed in your browser and never uploaded anywhere. The first row must be the header.</p>
        )}
      </section>

      {/* 2b: a way to show it on the screen: the table and the chart */}
      {hasData ? (
        <>
          <section className={styles.panel}>
            <h2 className={styles.h2}>Data preview</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>{columns.map((c) => <th key={c}>{c}<span className={styles.type}>{types[c]}</span></th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i}>{columns.map((c) => <td key={c} className={types[c] === "number" ? styles.num : ""}>{r[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > PREVIEW_ROWS ? <p className={styles.meta}>Showing the first {PREVIEW_ROWS} of {rows.length} rows.</p> : null}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.h2}>Chart</h2>
            <div className={styles.controls}>
              <label className={styles.control}>
                <span>X axis</span>
                <select value={xCol} onChange={(e) => setXCol(e.target.value)}>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className={styles.control}>
                <span>Y axis (numeric)</span>
                <div className={styles.checks}>
                  {numericCols.length ? numericCols.map((c) => (
                    <label key={c} className={yCols.includes(c) ? styles.checkOn : styles.check}>
                      <input type="checkbox" checked={yCols.includes(c)} onChange={() => toggleY(c)} />
                      {c}
                    </label>
                  )) : <span className={styles.meta}>No numeric column to plot.</span>}
                </div>
              </div>
              <div className={styles.control}>
                <span>Chart type</span>
                <div className={styles.checks}>
                  {["bar", "line", "scatter"].map((t) => (
                    <label key={t} className={chartType === t ? styles.checkOn : styles.check}>
                      <input type="radio" name="chartType" value={t} checked={chartType === t} onChange={() => setChartType(t)} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {yCols.length ? (
              <div ref={chartRef} className={styles.chart} />
            ) : (
              <p className={styles.meta}>Pick at least one numeric column for the Y axis.</p>
            )}
            {!plotlyReady ? <p className={styles.meta}>Loading the chart library...</p> : null}
          </section>

          <section className={styles.panel}>
            <div className={styles.aiHead}>
              <h2 className={styles.h2}>Ask Chart Doctor</h2>
              <button type="button" className={styles.primary} onClick={askChartDoctor} disabled={aiBusy || !yCols.length}>
                {aiBusy ? "Diagnosing..." : "Diagnose this chart"}
              </button>
            </div>
            <p className={styles.meta}>Sends the column names, types, the first five rows and your chosen encoding to the model. Not the whole file.</p>
            {aiReply ? <div className={aiReply.startsWith("[Chart Doctor error]") ? styles.error : styles.reply}>{aiReply}</div> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
