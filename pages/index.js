import Head from "next/head";
import Script from "next/script";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import styles from "./index.module.css";

const AUTHOR = "Md Jonayed Hossain Chowdhury";
const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";
const PREVIEW_ROWS = 6;
const PREVIEW_MAX = 60;
const PALETTE = ["#2f6f8f", "#d7792b", "#5b8c5a", "#8c5b7a", "#7a7a52", "#4b6b9a", "#b5534a", "#3f8f8a"];

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

// ---------- CSV parsing: quoted fields, embedded commas and newlines ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
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
  const header = rows[0].map((h, i) => h.trim() || `column_${i + 1}`);
  const data = rows.slice(1).map((r) => { const o = {}; header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); }); return o; });
  return { columns: header, rows: data };
}
const asNumber = (v) => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/[$,%\s]/g, "")); return Number.isFinite(n) ? n : null; };
function inferTypes(columns, rows) {
  const t = {};
  for (const c of columns) {
    const vals = rows.map((r) => r[c]).filter((v) => v !== "");
    const numeric = vals.filter((v) => asNumber(v) !== null).length;
    t[c] = vals.length && numeric / vals.length >= 0.9 ? "number" : "text";
  }
  return t;
}

// Chart Doctor is told to answer in three sections; split them so they read as cards.
function splitReply(text) {
  const re = /^\s*(Diagnosis|Why|Fix)\s*[-:–—]?\s*/im;
  const parts = [];
  const lines = text.split("\n");
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^\s*(Diagnosis|Why|Fix)\s*[-:–—]?\s*(.*)$/i);
    if (m) { cur = { label: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), body: m[2] }; parts.push(cur); }
    else if (cur) cur.body += (cur.body ? "\n" : "") + line;
  }
  return parts.length >= 2 && re.test(text) ? parts.map((p) => ({ ...p, body: p.body.trim() })) : null;
}

export default function Home() {
  const [plotlyReady, setPlotlyReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState({});
  const [xCol, setXCol] = useState("");
  const [yCols, setYCols] = useState([]);
  const [colorBy, setColorBy] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [showAll, setShowAll] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [model, setModel] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const chartRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Plotly) setPlotlyReady(true);
    fetch("/api/generate?endpoint=config").then((r) => r.json()).then((d) => setModel(d.model || "")).catch(() => {});
  }, []);

  const numericCols = useMemo(() => columns.filter((c) => types[c] === "number"), [columns, types]);
  const textCols = useMemo(() => columns.filter((c) => types[c] !== "number"), [columns, types]);
  const hasData = rows.length > 0;

  // ---------- loading ----------
  const loadText = useCallback((text, name) => {
    try {
      const parsed = parseCSV(text);
      const t = inferTypes(parsed.columns, parsed.rows);
      const nums = parsed.columns.filter((c) => t[c] === "number");
      const texts = parsed.columns.filter((c) => t[c] !== "number");
      setColumns(parsed.columns); setRows(parsed.rows); setTypes(t);
      setXCol(texts[0] || parsed.columns[0]);
      setYCols(nums.slice(0, 1));
      // If there is a second text column with few distinct values, use it as the series split.
      const second = texts.find((c, i) => i > 0 && new Set(parsed.rows.map((r) => r[c])).size <= 8);
      setColorBy(second || "");
      setChartType("bar");
      setFileName(name); setLoadError(""); setAiReply(""); setShowAll(false);
    } catch (e) { setLoadError(e.message || String(e)); }
  }, []);

  const readFile = useCallback((file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !/csv|text/.test(file.type)) { setLoadError("Please choose a .csv file."); return; }
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result), file.name);
    reader.onerror = () => setLoadError("Could not read that file.");
    reader.readAsText(file);
  }, [loadText]);

  const onDrop = (e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]); };
  const clearAll = () => {
    setColumns([]); setRows([]); setTypes({}); setXCol(""); setYCols([]); setColorBy("");
    setFileName(""); setLoadError(""); setAiReply(""); setShowAll(false);
    if (fileRef.current) fileRef.current.value = "";
    if (chartRef.current && window.Plotly) window.Plotly.purge(chartRef.current);
  };

  // ---------- drawing ----------
  useEffect(() => {
    if (!plotlyReady || !chartRef.current || !hasData || !xCol || !yCols.length) return;
    const xIsNumber = types[xCol] === "number";
    const sortRows = (arr) => (chartType === "bar" ? arr : [...arr].sort((a, b) => (a.x > b.x ? 1 : a.x < b.x ? -1 : 0)));
    const groups = colorBy ? [...new Set(rows.map((r) => r[colorBy]))] : [null];
    const traces = [];
    let k = 0;
    for (const y of yCols) {
      for (const g of groups) {
        const sub = sortRows(rows.filter((r) => g === null || r[colorBy] === g).map((r) => ({ x: xIsNumber ? asNumber(r[xCol]) : r[xCol], v: asNumber(r[y]) })));
        const name = g === null ? y : yCols.length > 1 ? `${y} · ${g}` : String(g);
        traces.push({
          type: chartType === "line" ? "scatter" : chartType,
          mode: chartType === "line" ? "lines+markers" : chartType === "scatter" ? "markers" : undefined,
          name, x: sub.map((d) => d.x), y: sub.map((d) => d.v),
          marker: { color: PALETTE[k % PALETTE.length], size: 8 },
          line: { color: PALETTE[k % PALETTE.length], width: 2.2 },
          hovertemplate: `${xCol}: %{x}<br>${y}: %{y}<extra>${name}</extra>`,
        });
        k++;
      }
    }
    const layout = {
      title: { text: `${yCols.join(", ")} by ${xCol}${colorBy ? `, split by ${colorBy}` : ""}`, x: 0, xanchor: "left", font: { size: 16, color: "#1d2b33" } },
      paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff",
      font: { family: "ui-sans-serif, -apple-system, Segoe UI, Helvetica, Arial, sans-serif", color: "#65717a", size: 13 },
      xaxis: { title: { text: xCol }, showgrid: false, linecolor: "#dcdcd6", type: xIsNumber ? "linear" : "category" },
      yaxis: { title: { text: yCols.length === 1 ? yCols[0] : "value" }, gridcolor: "#eeeeea", zerolinecolor: "#dcdcd6", rangemode: chartType === "bar" ? "tozero" : "normal" },
      barmode: "group",
      legend: { orientation: "h", y: 1.14, x: 0, xanchor: "left" },
      margin: { l: 64, r: 16, t: 78, b: 60 },
      hovermode: "closest",
    };
    window.Plotly.newPlot(chartRef.current, traces, layout, { displayModeBar: false, responsive: true });
  }, [plotlyReady, rows, xCol, yCols, colorBy, chartType, types, hasData]);

  const downloadPng = () => {
    if (chartRef.current && window.Plotly) {
      window.Plotly.downloadImage(chartRef.current, { format: "png", width: 1400, height: 800, filename: "chart" });
    }
  };

  // ---------- Chart Doctor ----------
  const askChartDoctor = async () => {
    if (!hasData || aiBusy) return;
    setAiBusy(true); setAiReply("");
    const sample = rows.slice(0, 5).map((r) => columns.map((c) => `${c}=${r[c]}`).join(", ")).join("\n");
    const summary = [
      `Dataset: ${fileName || "sample"}, ${rows.length} rows, ${columns.length} columns.`,
      `Columns and types: ${columns.map((c) => `${c} (${types[c]})`).join("; ")}.`,
      `First rows:\n${sample}`,
      `Chart I drew: ${chartType} chart, x = ${xCol}, y = ${yCols.join(" and ")}${colorBy ? `, one series per value of ${colorBy}` : ", no series split"}.`,
      `Diagnose this chart and tell me the most useful fix.`,
    ].join("\n");
    try {
      const resp = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: summary }] }) });
      if (!resp.body) throw new Error(`Server returned ${resp.status}.`);
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let text = "";
      for (;;) { const { value, done } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); setAiReply(text); }
      if (!text.trim()) setAiReply("[Chart Doctor error] Empty reply. Check the terminal running the server.");
    } catch (e) { setAiReply(`[Chart Doctor error] ${e.message || String(e)}`); }
    finally { setAiBusy(false); }
  };

  const toggleY = (c) => setYCols((p) => (p.includes(c) ? p.filter((v) => v !== c) : [...p, c]));
  const isError = aiReply.startsWith("[Chart Doctor error]");
  const sections = !isError && aiReply ? splitReply(aiReply) : null;
  const previewRows = showAll ? rows.slice(0, PREVIEW_MAX) : rows.slice(0, PREVIEW_ROWS);

  return (
    <div className={styles.page}>
      <Head>
        <title>Chart Doctor: upload data, see it, fix it</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Upload a CSV, chart it in the browser, and let an AI critic diagnose the chart." />
      </Head>
      <Script src={PLOTLY_CDN} strategy="afterInteractive" onLoad={() => setPlotlyReady(true)} />

      <header className={styles.header}>
        <div className={styles.brand}>
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
        </div>
        <div className={styles.byline}>
          <span>Built by <strong>{AUTHOR}</strong></span>
          {model ? <span className={styles.model} title="The OpenAI model answering Chart Doctor requests">model: {model}</span> : null}
        </div>
      </header>

      <main className={styles.main}>
        {/* ---------- Step 1: data ---------- */}
        <section className={styles.panel} aria-labelledby="s1">
          <div className={styles.stepHead}><span className={styles.stepNo}>1</span><h2 id="s1" className={styles.h2}>Data</h2></div>

          {!hasData ? (
            <div
              className={dragging ? styles.dropActive : styles.drop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
              role="button" tabIndex={0} aria-label="Upload a CSV file"
            >
              <input ref={fileRef} type="file" accept=".csv,text/csv" className={styles.hidden} onChange={(e) => readFile(e.target.files?.[0])} />
              <div className={styles.dropIcon} aria-hidden="true">⬆</div>
              <div className={styles.dropText}>
                <strong>Drop a CSV here</strong> or click to choose a file
                <span className={styles.dropHint}>First row must be the header. Parsed in your browser; nothing is uploaded.</span>
              </div>
              <button type="button" className={styles.ghost} onClick={(e) => { e.stopPropagation(); loadText(SAMPLE_CSV, "sample_sales.csv"); }}>
                Or load sample data
              </button>
            </div>
          ) : (
            <>
              <div className={styles.fileRow}>
                <div className={styles.fileChip} title={fileName}><span className={styles.fileIcon} aria-hidden="true">▤</span>{fileName}</div>
                <div className={styles.tiles}>
                  <div className={styles.tile}><span className={styles.tileN}>{rows.length.toLocaleString()}</span><span className={styles.tileL}>rows</span></div>
                  <div className={styles.tile}><span className={styles.tileN}>{columns.length}</span><span className={styles.tileL}>columns</span></div>
                  <div className={styles.tile}><span className={styles.tileN}>{numericCols.length}</span><span className={styles.tileL}>numeric</span></div>
                </div>
                <div className={styles.fileActions}>
                  <button type="button" className={styles.ghost} onClick={() => fileRef.current?.click()}>Replace file</button>
                  <button type="button" className={styles.ghostDanger} onClick={clearAll}>Clear</button>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className={styles.hidden} onChange={(e) => readFile(e.target.files?.[0])} />
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr>{columns.map((c) => <th key={c}>{c}<span className={styles.type}>{types[c]}</span></th>)}</tr></thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>{columns.map((c) => <td key={c} className={types[c] === "number" ? styles.num : ""}>{r[c]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_ROWS ? (
                <button type="button" className={styles.linkBtn} onClick={() => setShowAll((s) => !s)}>
                  {showAll ? `Show first ${PREVIEW_ROWS} rows` : `Show ${Math.min(rows.length, PREVIEW_MAX)} of ${rows.length} rows`}
                </button>
              ) : null}
            </>
          )}
          {loadError ? <div className={styles.error} role="alert">{loadError}</div> : null}
        </section>

        {/* ---------- Step 2: chart ---------- */}
        {hasData ? (
          <section className={styles.panel} aria-labelledby="s2">
            <div className={styles.stepHead}><span className={styles.stepNo}>2</span><h2 id="s2" className={styles.h2}>Chart</h2></div>
            <div className={styles.chartGrid}>
              <aside className={styles.controls}>
                <label className={styles.control}>
                  <span className={styles.label}>X axis</span>
                  <select value={xCol} onChange={(e) => setXCol(e.target.value)} className={styles.select}>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <div className={styles.control}>
                  <span className={styles.label}>Y axis <em>numeric columns, pick one or more</em></span>
                  <div className={styles.chips}>
                    {numericCols.length ? numericCols.map((c) => (
                      <label key={c} className={yCols.includes(c) ? styles.chipOn : styles.chip}>
                        <input type="checkbox" checked={yCols.includes(c)} onChange={() => toggleY(c)} />{c}
                      </label>
                    )) : <span className={styles.meta}>No numeric column found.</span>}
                  </div>
                </div>

                <label className={styles.control}>
                  <span className={styles.label}>Split into series by <em>optional</em></span>
                  <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} className={styles.select}>
                    <option value="">none</option>
                    {textCols.filter((c) => c !== xCol).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <div className={styles.control}>
                  <span className={styles.label}>Chart type</span>
                  <div className={styles.seg} role="radiogroup" aria-label="Chart type">
                    {[["bar", "Bar"], ["line", "Line"], ["scatter", "Scatter"]].map(([t, l]) => (
                      <button key={t} type="button" role="radio" aria-checked={chartType === t}
                        className={chartType === t ? styles.segOn : styles.segBtn} onClick={() => setChartType(t)}>{l}</button>
                    ))}
                  </div>
                </div>

                <button type="button" className={styles.ghost} onClick={downloadPng} disabled={!yCols.length || !plotlyReady}>Download PNG</button>
              </aside>

              <div className={styles.chartArea}>
                {yCols.length ? <div ref={chartRef} className={styles.chart} /> : (
                  <div className={styles.chartEmpty}>Pick at least one numeric column for the Y axis.</div>
                )}
                {!plotlyReady ? <div className={styles.chartEmpty}>Loading the chart library…</div> : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* ---------- Step 3: Chart Doctor ---------- */}
        {hasData ? (
          <section className={styles.panel} aria-labelledby="s3">
            <div className={styles.aiHead}>
              <div className={styles.stepHead}><span className={styles.stepNo}>3</span><h2 id="s3" className={styles.h2}>Chart Doctor</h2></div>
              <button type="button" className={styles.primary} onClick={askChartDoctor} disabled={aiBusy || !yCols.length}
                title={!yCols.length ? "Choose a Y column first" : "Ask the model to critique this chart"}>
                {aiBusy ? <><span className={styles.spinner} aria-hidden="true" /> Diagnosing…</> : "Diagnose this chart"}
              </button>
            </div>
            <p className={styles.meta}>Sends the column names, types, the first five rows and your chosen encoding. The full file never leaves your browser.</p>

            {isError ? <div className={styles.error} role="alert">{aiReply}</div> : null}
            {!isError && aiReply && sections ? (
              <div className={styles.cards}>
                {sections.map((s) => (
                  <div key={s.label} className={s.label === "Fix" ? styles.cardFix : styles.card}>
                    <div className={styles.cardLabel}>{s.label}</div>
                    <div className={styles.cardBody}>{s.body}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {!isError && aiReply && !sections ? <div className={styles.reply}>{aiReply}</div> : null}
          </section>
        ) : null}
      </main>

      <footer className={styles.footer}>Chart Doctor · built on the OpenAI Node quickstart · CPS 5745, Kean University</footer>
    </div>
  );
}
