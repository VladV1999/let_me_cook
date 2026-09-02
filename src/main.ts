import { parseArgs } from "node:util";
import { assignCheerio, retrieveGraphTag } from "./parser/parser.js";
import { recipeSchema } from "./schemas/recipe_schema.js";
import { scrapeRecipe } from "./scraper/scrape.js";


const RECIPE_FOR_FUTURE = "https://www.recipetineats.com/chicken-broccoli-stir-fry/"
async function main() {
    const { values } = parseArgs({
        options: {
            url: { type: 'string'}
        },
    })
    if (values.url === undefined) {
        throw new Error("Please provide a valid URL from a cooking site to scrape!");
    }
    console.log(values.url)
    const URL_TO_SCRAPE = values.url;
    const dumpPath = await scrapeRecipe(URL_TO_SCRAPE);
    if (!dumpPath) {
        throw new Error("Scrape failed, no dump.html written");
    }
    const cheerioOverHTML = await assignCheerio(dumpPath);
    const containerWithRecipe = await retrieveGraphTag(cheerioOverHTML);

    const recipe = recipeSchema.safeParse(containerWithRecipe);
    if (!recipe.success) {
        console.log(recipe.error);
    } else {
        console.log(recipe);
        console.log(recipe.data.recipeInstructions);
    }
}

await main();