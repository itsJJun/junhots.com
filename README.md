# junhots.com

Jun's website: Heroes of the Storm tier list, builds, draft helper, match history, patch notes and stream schedule.
Plain HTML files in `public/` plus a small Cloudflare Worker (`src/`) for the parts that save data.
Every change to `main` goes live by itself about a minute later.

## Change the text on the home page
Open `public/text.js`, click the pencil icon, change the words between the quotes, then click **Commit changes**.

## Where things come from
- **Tier list**: the stream overlay uploads it each time Jun saves in the tier list editor (`PUT /api/tierlist`).
- **Builds**: Jun edits them on the Builds page while logged in (`/api/builds`).
- **Recent games**: the overlay sends each ranked game after it ends (`/api/games`).
- **Schedule**: Jun's Twitch schedule, plus days off from the editor on `/schedule/`.
- **Patch notes**: read from Blizzard's news feed every few hours (`src/patch-notes.js`).

All of it is stored in Cloudflare (KV binding `BUILDS`). `public/data/tierlist.json`, `builds.json` and
`patch-notes.json` are only backup copies, shown if Cloudflare's copy can't be read.

## Pages (`public/`)
| Page | File |
|---|---|
| Home | `index.html` (+ `home-map.js`, the 3D island) |
| Tier list | `tierlist/` |
| Make your own tier list | `tierlist-maker/` |
| Builds (all heroes, and the build maker with `?make`) | `builds/` |
| Draft helper | `draft/` (edge math in `edge.js`, the same model as the overlay's match banner) |
| Match history | `games/` (+ `games.js`, `games.css`) |
| Patch notes | `patch-notes/` (+ `patch-changes.js`, also used on Builds) |
| Stream schedule | `schedule/` (+ `schedule.js`) |
| Overlay | `overlay/` |
| Updates log | `updates/` (entries in `data/updates.json`, pictures in `img/updates/`) |
| Feedback inbox (Jun only) | `inbox/` |

Shared by every page: `nav.js` (top bar, search, Feedback button), `site.css`, `site.js`, `map-picker.js/.css`.

## Server (`src/`)
`worker.js` handles `/api/*`, `/builds/<hero>` share links and `/sitemap.xml`; the list of every API is at the top of that file.
Helpers: `feedback.js`, `community.js`, `schedule.js`, `patch-notes.js`, `vods.js`.
Cloudflare settings are in `wrangler.jsonc`. Secrets live only in the Cloudflare dashboard, never in this repo
(`ADMIN_PASSWORD`, `FEEDBACK_WEBHOOK`, `TURNSTILE_SECRET`, plus the `TURNSTILE_SITEKEY` variable).

## After a HotS patch or a new hero
- `python tools/update_builds_data.py` rebuilds `public/data/heroes/*.json` and the talent icons.
- `node tools/make_link_previews.mjs` remakes the link preview pictures in `public/img/og/` (one per hero, plus
  `_home`, `_tierlist`, `_builds`, `_maker`, `_overlay`). Needs Playwright.

## Code formatting
HTML, CSS and JS are formatted with [Prettier](https://prettier.io) (settings in `.prettierrc.json`, skipped files in
`.prettierignore`). In VS Code, install the recommended Prettier extension and files format when you save.
From a terminal: `npx prettier --write .` (or `--check .` to only look).
Where line breaks show on the page (text with `white-space: pre-line`), put `<!-- prettier-ignore -->` above it.
