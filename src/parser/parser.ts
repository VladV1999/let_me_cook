import * as cheerio from "cheerio";
import type { Element } from 'domhandler';
import * as fs from "fs";
import ollama from "ollama";

import z from "zod";
import { enrichmentSchema, normalizedRecipeSchema, STATIONS, stepSchema, type normalizedRecipeSchemaType, type recipeSchemaType } from "../schemas/recipe_schema.js";

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

export async function sanitizeNormalRecipe(normalizedRecipe: normalizedRecipeSchemaType) {
    const model = 'qwen2.5:7b-instruct';
    const ENRICHMENT_PROMPT = `For each step below, assign a station (${STATIONS.join(", ")}) and estimate its duration in seconds.

Rules:
- If the step states an explicit time, convert it to seconds exactly (e.g. "10 seconds" -> 10, "2 minutes" -> 120). Never round it down to 0.
- If no time is stated, estimate a realistic duration from real-world cooking experience.
- Every step takes some non-zero time. This includes Prep steps like chopping, tenderising, or mixing - physical prep work is not instantaneous just because it doesn't involve heat.
- Only use a value near 0 for steps that are genuinely instantaneous with no physical action, like "serve" or "garnish and enjoy."

Steps:
${JSON.stringify(normalizedRecipe.steps.map(s => ({ id: s.id, text: s.text })))}`;
    const response = await ollama.chat({
        model: model,
        messages: [{role: 'user', content: ENRICHMENT_PROMPT}],
        format: z.toJSONSchema(enrichmentSchema)
    })
    const enrichment = enrichmentSchema.parse(JSON.parse(response.message.content));
    const byId = new Map(enrichment.results.map(r => [r.id, r]));
    const enriched = normalizedRecipe.steps.map(step => {
        const result = byId.get(step.id);
        return {
            ...step,
            station: result?.station ?? step.station,
            durationSeconds: result?.durationSeconds ?? step.durationSeconds
        }
    })
    return enriched;
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
