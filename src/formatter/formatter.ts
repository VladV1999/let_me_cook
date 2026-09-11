import { type normalizedRecipeSchemaType } from "../schemas/recipe_schema.js";

function formatDuration(seconds?: number | null): string {
    if (seconds === undefined || seconds === null) return "?";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

export function printRecipeSummary(recipe: normalizedRecipeSchemaType) {
    console.log(`\n=== ${recipe.id} ===`);
    console.log(`Yield: ${JSON.stringify(recipe.yield)}`);
    if (recipe.totalDurationSeconds) {
        console.log(`Total duration: ${formatDuration(recipe.totalDurationSeconds)}`);
    }

    console.log("\nSteps:");
    console.table(
        recipe.steps.map(step => ({
            id: step.id,
            text: step.text.length > 50 ? step.text.slice(0, 47) + "..." : step.text,
            station: step.station ?? "?",
            duration: formatDuration(step.durationSeconds),
            dependsOn: step.dependsOn.length ? step.dependsOn.join(", ") : "(start)"
        }))
    );

    // quick visual of the dependency graph — flag anything interesting
    const parallelStarts = recipe.steps.filter(s => s.dependsOn.length === 0);
    const mergePoints = recipe.steps.filter(s => s.dependsOn.length > 1);

    if (parallelStarts.length > 1) {
        console.log(`\n🔀 ${parallelStarts.length} parallel starting points: steps [${parallelStarts.map(s => s.id).join(", ")}]`);
    }
    if (mergePoints.length > 0) {
        console.log(`\n🔗 Merge points detected:`);
        for (const step of mergePoints) {
            console.log(`   Step ${step.id} ("${step.text.slice(0, 40)}...") waits on steps [${step.dependsOn.join(", ")}]`);
        }
    } else {
        console.log(`\n⛓️  Pure linear chain — no merge points detected.`);
    }
}