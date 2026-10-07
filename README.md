# Chart Doctor

Upload a CSV, see it as a table and a chart in the browser, then ask an AI critic
what is misleading about the chart and how to fix it.

Built by Md Jonayed Hossain Chowdhury for CPS 5745, from the OpenAI
`openai-quickstart-node` chat example (branch `dev/logan/migrate-to-chat-completions`).

## What it does

- **Upload custom data.** Any CSV with a header row. It is parsed in the browser
  and never sent anywhere. A built-in sample dataset is one click away.
- **Show it on screen.** A data preview table with inferred column types, and a
  Plotly chart with selectable X column, one or more numeric Y columns, and bar,
  line or scatter form. Bar charts always start the Y axis at zero.
- **Chart Doctor.** Sends the column names, types, the first five rows and the
  chosen encoding to an OpenAI model, which replies with a Diagnosis, Why, and
  Fix. The whole file is never sent.

## How Chart Doctor sees the chart

A language model cannot see a picture, and a description of the settings the
user picked is not the same as the chart on screen. So before each request the
app reads the rendered Plotly figure back (`_fullLayout` and `_fullData`): the
final axis ranges, whether the y axis starts at zero, whether a legend is
actually shown and what it lists, each series' colour, and each series' point
count, min, max, first and last value. It also flags repeated x positions
(several rows drawn at the same x, which makes a line zigzag) and series whose
scales differ by 5x or more on one shared axis. That spec is sent with the
prompt and shown to the user under "What Chart Doctor saw", so every critique
can be checked against the numbers it was given.

Example: with the sample data, no series split and a line chart, the spec reports
"12 points, 6 repeated x values" and a y axis that "does NOT start at zero",
which is exactly why that chart zigzags between the two regions.

## Run locally

    npm install
    cp .env.example .env        # then put your key in .env as OPENAI_API_KEY="sk-..."
    npm run dev                 # http://localhost:3000

Optional, in `.env`: `OPENAI_MODEL=gpt-5.2` (or any model your key can use).
To see which models the key accepts: `http://localhost:3000/api/generate?endpoint=models`

## Deploy to Vercel

1. Push this repository to GitHub.
2. At vercel.com, **Add New > Project**, import the repository. Vercel detects Next.js.
3. Under **Environment Variables** add `OPENAI_API_KEY` with your key, and optionally
   `OPENAI_MODEL`. Never commit `.env`; it is git-ignored.
4. Deploy. The live URL is the submission.

The server is stateless on purpose: the browser sends the whole request each
time, so it works on serverless hosts where consecutive requests may not share
memory.

## Files

- `pages/index.js` - the page: upload, table, chart controls, Plotly chart, Chart Doctor panel.
- `pages/api/generate.js` - the API route: streams the model's reply; `?endpoint=models` and `?endpoint=config` for diagnostics.
- `pages/index.module.css` - styling.
