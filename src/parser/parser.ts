import * as cheerio from "cheerio";
import type { Element } from 'domhandler';
import * as fs from "fs";
import ollama from "ollama";

import z from "zod";
import {
    dependencyOverrideSchema,
    enrichmentSchema, normalizedRecipeSchema, STATIONS, stepSchema,
    type normalizedRecipeSchemaType, type recipeSchemaType
} from "../schemas/recipe_schema.js";

export async function assignCheerio(docPath: string) {
    const html = fs.readFileSync(docPath, 'utf-8')
    const $ = cheerio.load(html);
    return $;
}

export async function retrieveGraphTag(doc: cheerio.CheerioAPI) {
    const plainData = doc('script[type="application/ld+json"]');
    const rawStrings = plainData.map((i: number, el: Element) => {
        return doc(el).html();
    }).get();
    const arr: any[] = rawStrings.map(str => JSON.parse(str!));
    const graphContainer = arr.find((obj: any) => Array.isArray(obj["@graph"]));
    if (graphContainer === undefined) {
        throw new Error("There is no script tag with a graph list inside")
    };
    const recipe = graphContainer["@graph"].find((node: any) =>
    Array.isArray(node["@type"]) ? node["@type"].includes("Recipe") : node["@type"] === "Recipe")
    return recipe;
}

export function normalizeRecipe(recipe: recipeSchemaType, recipeId: string): normalizedRecipeSchemaType {
    let steps = [];
    for (const [i, element] of recipe.recipeInstructions.entries()) {
        const text = element["@type"] === "HowToStep"
            ? element.text :
            element.itemListElement.map(s => s.text).join(" ");
        const step = stepSchema.parse({
        id: i,
        dependsOn: i === 0 ? [] : [i - 1],
        text: text
        })
        steps.push(step);
    }
    const normalizedRecipe = normalizedRecipeSchema.parse({
        id: recipeId,
        steps: steps,
        totalDurationSeconds: recipe.cookTime !== undefined ?
        iso8601DurationToSeconds(recipe.cookTime) : 0,
        yield: recipe.recipeYield
    })
    return normalizedRecipe;
}

async function callEnrichment(
    model: string,
    steps: { id: number; text: string }[]
): Promise<Map<number, z.infer<typeof enrichmentSchema>['results'][number]>> {
    const ENRICHMENT_PROMPT = `For each step below, assign a station (${STATIONS.join(", ")}) and estimate its duration in seconds.

Rules:
- If the step states an explicit time, convert it to seconds exactly (e.g. "10 seconds" -> 10, "2 minutes" -> 120). Never round it down to 0.
- If no time is stated, estimate a realistic duration from real-world cooking experience.
- Every step takes some non-zero time. This includes Prep steps like chopping, tenderising, or mixing - physical prep work is not instantaneous just because it doesn't involve heat.
- Only use a value near 0 for steps that are genuinely instantaneous with no physical action, like "serve" or "garnish and enjoy."

Steps:
${JSON.stringify(steps.map(s => ({ id: s.id, text: s.text })))}`;

    const response = await ollama.chat({
        model,
        messages: [{ role: 'user', content: ENRICHMENT_PROMPT }],
        format: z.toJSONSchema(enrichmentSchema),
        options: {
            temperature: 0,
            seed: 42
        }
    });
    const enrichment = enrichmentSchema.parse(JSON.parse(response.message.content));
    return new Map(enrichment.results.map(r => [r.id, r]));
}

export async function sanitizeNormalRecipe(normalizedRecipe: normalizedRecipeSchemaType): Promise<normalizedRecipeSchemaType> {
    const model = 'qwen2.5:7b-instruct';
    const MAX_RETRIES = 2;

    const [initialById, dependencyGraph] = await Promise.all([
        callEnrichment(model, normalizedRecipe.steps),
        extractDependencyGraph(normalizedRecipe.steps)
    ]);

    const byId = new Map(initialById);
    let missing = normalizedRecipe.steps.filter(s => !byId.has(s.id));

    for (let attempt = 1; attempt <= MAX_RETRIES && missing.length > 0; attempt++) {
        console.warn(`Enrichment missing ${missing.length} step(s) [${missing.map(s => s.id).join(", ")}], retry ${attempt}/${MAX_RETRIES}`);
        const retryResults = await callEnrichment(model, missing);
        for (const [id, result] of retryResults) {
            byId.set(id, result);
        }
        missing = normalizedRecipe.steps.filter(s => !byId.has(s.id));
    }

    if (missing.length > 0) {
        console.warn(`Enrichment permanently missing for step ids after ${MAX_RETRIES} retries: ${missing.map(s => s.id).join(", ")} — falling back to parser defaults for these`);
    }

    const enrichedSteps = normalizedRecipe.steps.map(step => {
        const result = byId.get(step.id);
        return {
            ...step,
            station: result?.station ?? step.station,
            durationSeconds: result?.durationSeconds ?? step.durationSeconds,
            dependsOn: dependencyGraph.get(step.id) ?? step.dependsOn
        };
    });

    return {
        ...normalizedRecipe,
        steps: enrichedSteps
    };
}

async function extractDependencyGraph(
    steps: { id: number; text: string; dependsOn: number[] }[]
): Promise<Map<number, number[]>> {
    const model = 'qwen2.5:7b-instruct';

    const DEPENDENCY_PROMPT = `Steps are normally sequential — each step depends only on the step immediately before it.

Your job is to flag ONLY the steps that break this default pattern. A step breaks the default pattern in either of these ways:

1. PARALLEL START: the step can happen independently, at the same time as earlier steps (e.g. "meanwhile," "while the X is happening," "in a separate bowl") — give it dependsOn: [] or dependsOn on whichever earlier step it actually needs, NOT the step right before it in the list.

2. MERGE POINT: the step's text mentions USING, ADDING, or COMBINING an ingredient or component that was specifically prepared in an EARLIER step (not just the step directly before it). This includes cases where the step lists multiple prior components by name (e.g. "add the broccoli, sauce, and chicken") — every one of those earlier steps that produced a named component must be included in dependsOn, even if the step's text doesn't explicitly say "once X is ready" or use time-based transition words. Read the step's ingredient/component references carefully, not just its transition phrasing.

Do NOT include steps that just depend on the step directly before them — only list exceptions.

Steps:
${JSON.stringify(steps.map(s => ({ id: s.id, text: s.text })))}`;

    const defaultGraph = new Map<number, number[]>(steps.map(s => [s.id, s.dependsOn]));

    let overrides: z.infer<typeof dependencyOverrideSchema>['results'] = [];
    try {
        const response = await ollama.chat({
            model,
            messages: [{ role: 'user', content: DEPENDENCY_PROMPT }],
            format: z.toJSONSchema(dependencyOverrideSchema),
            options: {
                temperature: 0,
                seed: 42
            }
        });
        const parsed = dependencyOverrideSchema.parse(JSON.parse(response.message.content));
        overrides = parsed.results;
    } catch (err) {
        console.warn('Dependency extraction failed, falling back to linear chain:', err);
        return defaultGraph;
    }

    const candidateGraph = new Map(defaultGraph);
    const validIds = new Set(steps.map(s => s.id));

    for (const override of overrides) {
        if (!validIds.has(override.id)) continue;
        const cleanDeps = override.dependsOn.filter(id => validIds.has(id) && id !== override.id);
        candidateGraph.set(override.id, cleanDeps);
    }

    if (!isValidDag(candidateGraph, steps)) {
        console.warn('LLM-produced graph failed validation (cycle or unreachable step), falling back to linear chain');
        return defaultGraph;
    }

    return candidateGraph;
}

function isValidDag(graph: Map<number, number[]>, steps: { id: number }[]): boolean {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map(steps.map(s => [s.id, WHITE]));

    function hasCycle(id: number): boolean {
        color.set(id, GRAY);
        for (const depId of graph.get(id) ?? []) {
            const c = color.get(depId);
            if (c === GRAY) return true;
            if (c === WHITE && hasCycle(depId)) return true;
        }
        color.set(id, BLACK);
        return false;
    }

    for (const step of steps) {
        if (color.get(step.id) === WHITE && hasCycle(step.id)) return false;
    }

    const hasRoot = steps.some(s => (graph.get(s.id) ?? []).length === 0);
    return hasRoot;
}


function iso8601DurationToSeconds(duration: string): number {
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) throw new Error(`Invalid ISO8601 duration: ${duration}`);

  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}
