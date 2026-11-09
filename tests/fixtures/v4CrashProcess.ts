import { StudyManager } from "../../src/v4science/manager";
import { DEFAULT_V4_CONFIG } from "../../src/v4/types";
import { PROTOCOL } from "../../src/v4science/types";
const m = new StudyManager({ root: process.argv[2], batchSize: 1 });
const study = m.start({
  protocol: PROTOCOL,
  name: "Crash fixture",
  configs: [DEFAULT_V4_CONFIG],
  families: ["COORD_HYBRID"],
  seeds: Array.from({ length: 12 }, (_, i) => 401 + i),
  experimentSeed: 11,
  environmentSeed: 13,
  policySeed: 17,
  independentGames: true,
});
console.log(JSON.stringify({ id: study.id }));
setInterval(
  () => console.log(JSON.stringify({ completed: m.get(study.id).completed })),
  20,
);
