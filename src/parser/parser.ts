import * as cheerio from "cheerio";
import type { Element } from 'domhandler';
import * as fs from "fs";
import { normalizedRecipeSchema, type normalizedRecipeSchemaType, type recipeSchemaType, stepSchema } from "../schemas/recipe_schema.js";
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
        totalDurationMinutes: recipe.cookTime !== undefined ? 
        iso8601DurationToMinutes(recipe.cookTime) : 0,
        yield: recipe.recipeYield
    })
    return normalizedRecipe;
}

function iso8601DurationToMinutes(duration: string): number {
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) throw new Error(`Invalid ISO8601 duration: ${duration}`);

  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 24 * 60 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Number(seconds ?? 0) / 60
  );
}
