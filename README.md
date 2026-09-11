# let_me_cook 🍳

A backend pipeline that scrapes a recipe from the web, parses it into structured steps, and uses a local LLM to enrich each step with a **station assignment**, an **estimated duration**, and a **dependency graph** — laying the groundwork for a cooking scheduler that can compute optimal timing across multiple dishes and cooks.

This is the data pipeline stage of a larger project: recipe scraping → normalization → LLM enrichment → dependency graph extraction. The scheduling algorithm (which consumes this output to compute an actual cook timeline) is the next stage, not yet included here.

## How it works

1. **Scrape** — fetches the recipe page HTML from a given URL (currently targets [RecipeTinEats](https://www.recipetineats.com/)).
2. **Parse** — extracts the recipe's structured data (via embedded schema.org `Recipe` JSON-LD), validated against a Zod schema.
3. **Normalize** — converts the raw recipe into a flat, ordered list of steps, each with a numeric `id` and a default linear `dependsOn` chain (each step depends on the one before it).
4. **Enrich** (LLM pass, via local Ollama model):
   - Assigns each step a **station**: `Stove`, `Oven`, `Microwave`, or `Prep`
   - Estimates each step's **duration in seconds**
   - Runs a retry pass on any steps the model failed to return data for
5. **Extract dependency graph** (second LLM pass, run in parallel with enrichment):
   - Detects steps that break the default linear-chain assumption — either **parallel starts** (steps that don't depend on anything, or depend on an earlier step further back than "the one right before it") or **merge points** (steps requiring multiple prior steps to be complete, e.g. "combine the sauce and the pasta")
   - Validates the resulting graph (checks for cycles, unreachable steps, and that every `dependsOn` id actually exists) and falls back to the safe linear-chain default if validation fails

The result is a fully enriched recipe: every step annotated with its station, duration, and true dependencies — ready to feed into a scheduling algorithm.

## Prerequisites

- **Node.js** (with `npx`/`tsx` support)
- **[Ollama](https://ollama.com/)** installed and running locally
- The `qwen2.5:7b-instruct` model pulled:
  ```bash
  ollama pull qwen2.5:7b-instruct
  ```
  Ollama must be running (`ollama serve`, or the desktop app) before running this project — the enrichment and dependency-extraction steps will fail without it.

## Installation

```bash
npm install
```

## Usage

```bash
npx tsx src/main.ts --url <recipe-url>
```

Example:

```bash
npx tsx src/main.ts --url https://www.recipetineats.com/chicken-broccoli-stir-fry/
```

Currently supports recipe pages from **RecipeTinEats** (or any site exposing a standard schema.org `Recipe` JSON-LD block). Support for other recipe sites is a planned extension of the parser.

On success, the console prints a summary table of the enriched steps (station, duration, dependencies) and flags any detected parallel-start points or merge points.

## Project structure

```
src/
├── main.ts                    # CLI entry point — orchestrates scrape → parse → normalize → enrich
├── parser/
│   └── parser.ts              # HTML parsing, recipe normalization, and LLM enrichment logic
├── schemas/
│   └── recipe_schema.ts       # Zod schemas for the raw scraped recipe and normalized step data
└── scraper/
    └── scrape.ts              # Fetches and dumps the raw recipe page HTML
└── formatter/
    └── formatter.ts           # Is only used for formatting the enriched recipe
```

## Design notes

A few deliberate engineering decisions worth calling out:

- **Station assignment does *not* use the LLM.** It's intentionally kept as heuristic/keyword-based logic (with human-in-the-loop confirmation planned) — this project treats station mapping as a mechanical classification task better suited to hand-rolled logic, reserving the LLM for genuinely contextual, language-understanding tasks.
- **Dependency-graph extraction *does* use the LLM**, since detecting implicit parallelism and merge points from natural-language recipe text requires contextual understanding that a keyword heuristic handles poorly.
- **Every LLM call is schema-validated** (via Zod, using Ollama's structured-output `format` support) and has a **safe fallback**: enrichment falls back to parser-derived defaults per field, and dependency extraction falls back to a pure linear chain if the returned graph fails validation (cycle detected, unreachable step, or malformed references).
- **Determinism**: Ollama calls are run with `temperature: 0` and a fixed `seed` to keep output reproducible across runs — useful both for debugging and for treating this as one deterministic stage in a larger pipeline.

### Known limitation

The dependency-extraction model reliably catches *explicit* multi-ingredient merges (e.g. "add the broccoli, sauce, and chicken" correctly resolving to three dependencies) but doesn't always infer *implicit* continuity with the immediately preceding step when that step isn't explicitly re-named in the text (e.g. a step continuing to cook something already in the pan from the step before, without re-mentioning it by name). This is a known ceiling of prompting a small local model for this task, rather than a bug in the pipeline logic.

## Status

This is a work-in-progress project (Boot.dev Backend Developer Certificate final project). Completed so far: scraping, parsing/normalization, and LLM-based enrichment + dependency-graph extraction. The scheduling algorithm (converting the dependency graph + durations into an actual cook timeline for a single cook, single dish) is the next stage of the project.