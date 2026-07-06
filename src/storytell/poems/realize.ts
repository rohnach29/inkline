import type { PoemFeatures } from "./features";
import type { FeatureCond, PoemBranch, PoemLine, PoemUnit } from "./forms";

export function isBranch(unit: PoemUnit): unit is PoemBranch {
  return "branch" in unit;
}

/** Every key listed in the condition must match the computed feature.
 *  An undefined feature never matches — strict beats clever. */
export function matches(cond: FeatureCond, features: PoemFeatures): boolean {
  return (Object.keys(cond) as (keyof FeatureCond)[]).every((key) => {
    const allowed = cond[key] as readonly string[] | undefined;
    const value = features[key];
    return allowed !== undefined && value !== undefined && allowed.includes(value);
  });
}

/** Flatten a poem's units into concrete lines: plain lines pass through, each
 *  branch yields its first matching variant, else its default. Pure — no rng,
 *  no throwing; missing data only ever means "the default couplet". */
export function realizeLines(
  units: readonly PoemUnit[],
  features: PoemFeatures,
): PoemLine[] {
  return units.flatMap((unit) => {
    if (!isBranch(unit)) return [unit];
    const hit = unit.branch.variants.find((v) => matches(v.when, features));
    return [...(hit?.lines ?? unit.branch.default)];
  });
}
