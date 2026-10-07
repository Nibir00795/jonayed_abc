import OpenAI from "openai";

const openai = new OpenAI();

// One place for the model. Override from the environment without touching code:
//   OPENAI_MODEL=gpt-5.2   (in .env locally, or in Vercel's Environment Variables)
// GET /api/generate?endpoint=models lists what this key can actually use.
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Chart Doctor: the AI feature of this data visualization app.
const SYSTEM_PROMPT = `You are Chart Doctor, a data visualization critic built into a
small charting app. The user uploads a dataset and draws a chart from it; you are
shown a summary of the columns, a few sample rows, and a RENDERED CHART spec that
the app reads back from the live figure: axis titles and ranges, whether the
legend is shown, colours, and per-series min, max, first and last values.

Treat the rendered spec as ground truth. Never say an element is missing (a
legend, an axis title, a label) if the spec shows it. Base the critique on what
the spec reveals: an axis that does not start at zero on a bar chart, series on
very different scales sharing one axis, repeated x values that stack or zigzag,
missing values, category order, too many series, or a better column left unused.
Quote the actual numbers from the spec when they support your point.

Reply in exactly three short sections:

Diagnosis - what works and what misleads or is unclear in the chart as described.
Why - the perceptual or statistical reason, in plain language.
Fix - the single most useful change: which column on which axis, which chart
type, and why. If their choice is already sound, say so and suggest one refinement.

Rules: three or four sentences per section at most. Never invent values the
summary did not give you. Treat the dataset as the user's own; do not speculate
about where it came from. Never recommend a second y-axis; when measures have
different scales, suggest separate charts, small multiples, or indexing to a
common base instead.`;

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  const { method } = req;

  if (method === "GET") {
    if (req.query.endpoint === "config") {
      return res.status(200).json({ model: MODEL });
    }
    if (req.query.endpoint === "models") {
      try {
        const list = await openai.models.list();
        return res.status(200).json({ current: MODEL, available: list.data.map((m) => m.id).sort() });
      } catch (error) {
        return res.status(500).json({ error: error?.message || String(error) });
      }
    }
    return res.status(404).json({ error: "Not Found" });
  }

  if (method === "POST") {
    // Stateless by design. The original kept the conversation in a module-level
    // variable across two requests, which breaks on serverless hosts like Vercel
    // where consecutive requests can land on different instances. The browser now
    // sends the whole conversation each time and the reply streams straight back.
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!messages || !messages.length) {
      return res.status(400).json({ error: "Send { messages: [...] }." });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      const stream = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) res.write(delta);
      }
      return res.end();
    } catch (error) {
      // Surface the real reason (bad model name, unpaid key, network) instead of
      // a generic message. Headers may already be sent, so write it into the body.
      const detail = error?.error?.message || error?.message || String(error);
      if (!res.headersSent) res.status(500);
      res.write(`\n[Chart Doctor error] ${detail}`);
      return res.end();
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${method} Not Allowed`);
}
