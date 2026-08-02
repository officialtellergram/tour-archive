# Drop photos here

This folder is the intake for **real product photography**. A Desktop shortcut
("Tour Archive Drop Photos") points at this same folder.

How it works:

1. Drop `.jpg` / `.png` / `.webp` files in. Name them descriptively —
   `quarter-zip-navy-lambswool-L.jpg` beats `IMG_4412.jpg`, because the title,
   garment type, colourway and price are inferred from the filename.
2. Run `npm run ingest` (or just build — it runs automatically). Each new image
   gets an entry in `manifest.json` with an inferred title, price and
   description.
3. Edit `manifest.json` freely to correct anything — the ingest never
   overwrites fields you've touched, it only adds entries for new files.
4. Commit + push. The piece appears on the site as available stock.

Optional extras:
- Put a catalogue number in the filename (`TA-TC-01-…`) to bind the piece to a
  collection when it later goes to eBay.
- A file named `hero-<collection-id>.jpg` (e.g. `hero-tour-championship-2026.jpg`)
  is used as that collection's landing hero backdrop instead of stock.

Keep files under ~1.5 MB each (they ship with the site). The ingest warns on
oversized files.
