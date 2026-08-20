# let_me_cook

A recipe scraper/parser pipeline, built as groundwork for an eventual kitchen
scheduling engine: given a set of dishes to cook and a limited number of
shared stations/cooks, schedule them efficiently (an NP-hard
resource-constrained scheduling problem). This repo is the data layer for
that — turning recipe web pages into structured, typed recipe data.

## How it works

1. **Scrape** ([src/scraper/scrape.ts](src/scraper/scrape.ts)) — fetches a
   recipe URL and dumps the raw HTML to `dump.html`.
2. **Parse** ([src/parser/parser.ts](src/parser/parser.ts)) — loads the HTML
   with [cheerio](https://cheerio.js.org/), finds the page's
   `<script type="application/ld+json">` tags (most recipe sites embed
   [schema.org](https://schema.org/Recipe) structured data this way), and
   pulls the `Recipe` node out of the `@graph`.
3. **Validate** ([src/schemas/zod_schema.ts](src/schemas/zod_schema.ts)) — the
   extracted node is run through a [Zod](https://zod.dev/) schema
   (`recipeSchema`) that shapes it into typed data. Only `name`,
   `recipeIngredient`, and `recipeInstructions` are required; timing fields
   (`cookTime`, `prepTime`, `totalTime`, `performTime`) and a few others are
   optional since sites are inconsistent about which ones they emit.

## Running it

```bash
npm install
npx tsx src/scraper/scrape.ts   # writes dump.html
cd src/parser && npx tsx parser.ts   # parses dump.html, validates, prints the recipe
```

## Known rough edges

- `scrape.ts` has a hardcoded recipe URL and writes to a relative
  `../../dump.html` path — both are meant to be parameterized later.
- `parser.ts`'s `dump.html` path is also relative, so it currently only works
  run from `src/parser/`.
- Only tested against one site (RecipeTinEats) so far; the schema will
  likely need loosening/adjusting as more sites are scraped.
