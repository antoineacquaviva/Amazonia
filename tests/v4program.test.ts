import test from "node:test";
import assert from "node:assert/strict";
import { programPlans } from "../src/v4science/program";
import { totalJobs, validatePlan } from "../src/v4science/protocol";
test("partitioning keeps all paired seeds exactly once across admissible cells", () => {
  for (const budget of [56, 2000, 20000]) {
    const plans = programPlans(32, budget),
      jobs = new Set<string>();
    for (const p of plans) {
      validatePlan(p, budget);
      assert(totalJobs(p) <= budget);
      for (const c of p.configs)
        for (const f of p.families)
          for (const seed of p.seeds) {
            const key = JSON.stringify([c, f, seed]);
            assert(!jobs.has(key));
            jobs.add(key);
          }
    }
    assert.equal(jobs.size, 14336);
  }
  assert.throws(() => programPlans(32, 55));
});
