# Changes from the original quickstart

Md Jonayed Hossain Chowdhury

The clone is branch `dev/logan/migrate-to-chat-completions`, which is a streaming
chat app rather than the older pet-name generator the handout describes. The
handout's steps were applied to the equivalent places, and the app was then
converted into a data visualization app as the assignment requires.

## Assignment step 2: a data visualization app

**a) A way to upload custom data.** A file input accepts any CSV. A small parser
in `pages/index.js` handles quoted fields, embedded commas and newlines, and
infers each column's type. Parsing happens in the browser; nothing is uploaded to
a server. A sample dataset loads with one click so the live app demonstrates
itself.

**b) A way to show it on the screen.** Two views of the same data: a preview
table with column types, and a Plotly chart. The user chooses the X column, any
number of numeric Y columns, and bar, line or scatter. Line and scatter sort by
X; bar charts keep the Y axis anchored at zero.

**With the help of AI tools.** The original chat endpoint became Chart Doctor:
the app sends a summary of the loaded data and the chosen encoding to the model
and streams back a Diagnosis, a Why, and a Fix. The model never sees the full
file. AI assistants were also used in writing the code; the author reviewed and
tested every change.

## Handout step 6, applied to this branch

1. **Make the code work.** Four fixes in `pages/api/generate.js`: the model is a
   single constant overridable from the environment; the server is stateless
   (the original kept the conversation in a module-level variable across two
   requests, which breaks on serverless hosts such as Vercel and also forgot the
   assistant's own replies); the stream now ends cleanly instead of leaving the
   request open; and the real API error is surfaced on screen instead of a
   generic message. A `?endpoint=models` diagnostic lists the models the key can
   use.
2. **Name on the GUI.** Rendered under the title.
3. **What the application provides.** Chart diagnosis instead of general chat;
   see the system prompt in `pages/api/generate.js`.
4. **Look and feel.** OpenAI's green and CDN webfont replaced by an ink and slate
   palette on warm paper with one amber accent, system fonts, and an inline SVG
   logo (the original had no image). Colours live in CSS custom properties.

Originals are kept locally in `.backup-original/` and are not committed.
