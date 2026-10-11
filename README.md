# junhots.com

Jun's website: Heroes of the Storm tier list, "Make your tier list" page, and (later) the stream overlay download.
Plain HTML files, hosted free on Cloudflare Pages. Every change to `main` goes live by itself about a minute later.

## Change the text on the home page
Open `text.js`, click the pencil icon, change the words between the quotes, then click **Commit changes**.

## Update the tier list
`data/tierlist.json` is a copy of the overlay's `tierlist.json` (D:\Stream\Hots Overlay\tierlist.json).
To update it: open `data/tierlist.json` on GitHub, click the pencil, paste the new file's contents over it, and commit.

## Files
- `index.html` – home page
- `tierlist-maker/index.html` – make your own tier list (share links need no server, so it costs nothing)
- `data/heroes.json` – hero list: id, name, role
- `img/heroes/` – hero portraits
