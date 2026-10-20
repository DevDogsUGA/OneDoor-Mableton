# OneDoor Mableton

Georgia 311 Challenge 2026 · DevDogs (GDG on Campus UGA)

- Track: Tiny Desk, Civic Style
- Advisor: Jack Harrington
- Sprint: Oct 16–30, 2026. Demo Day: Fri Oct 30 at DevFest Atlanta.

## What's here

A [clasp](https://github.com/google/clasp) project, so the Apps Script code lives in Git. Nothing is built yet; that's up to you.

| File | What it's for |
| --- | --- |
| `src/Code.gs` | Your code. It has a `testGemini()` to check the API key. |
| `src/appsscript.json` | Project settings (time zone, runtime). Apps Script adds permission scopes as you use services. |

The stack is all Google: [Forms](https://developers.google.com/apps-script/reference/forms), [Sheets](https://developers.google.com/apps-script/reference/spreadsheet), [Apps Script](https://developers.google.com/apps-script) and the [Gemini API](https://ai.google.dev/gemini-api/docs), plus [Looker Studio](https://lookerstudio.google.com) for dashboards. There's no build step and nothing to deploy.

## Set up

You need [Node.js](https://nodejs.org) for clasp.

1. `npm install -g @google/clasp`, then `clasp login`.
2. Turn on the Apps Script API at https://script.google.com/home/usersettings.
3. One teammate creates the script: `clasp create --type standalone --title "OneDoor Mableton" --rootDir src`. Commit nothing from this step; `.clasp.json` is ignored. Share the script with your teammates (`clasp open`, then Share).
4. Everyone else: copy `.clasp.json.example` to `.clasp.json` and paste the script ID (Project Settings in the editor).
5. Get a Gemini API key at https://aistudio.google.com/apikey and choose the Google Cloud project `g311-onedoor-mableton`. In the editor, add it under Project Settings → Script Properties as `GEMINI_API_KEY`.
6. `clasp push`, then run `testGemini` in the editor.

If Gemini replies "This model is currently experiencing high demand", change `GEMINI_MODEL` in `src/Code.gs` to an older Flash model such as `gemini-3.5-flash`. The newest model is the busiest on the free tier.

## Working on it

- `clasp push` uploads `src/` to the script; `clasp pull` downloads edits made in the browser editor. Pick one place to edit, or pull before you push.
- Commit and open pull requests as usual; the script itself has no history, so Git is the record.
