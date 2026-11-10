import { setImmediate as yieldLoop } from "node:timers/promises";
import type { StudyManager } from "./manager";
import type { Measures, TurnMeasures } from "./types";
import type { Program } from "./program";

type Totals = Record<string, number>;
function add(target: Totals, source: object, omit: readonly string[] = []) {
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "number" && !omit.includes(k))
      target[k] = (target[k] ?? 0) + v;
  }
}
interface CellTotals {
  configId: string;
  family: string;
  games: number;
  gameSums: Totals;
  turns: Totals[];
  players: { player: number; sums: Totals; rankTrajectorySums: number[] }[];
}
export async function diagnostics(
  manager: StudyManager,
  program: Program,
  counts: number[],
  disconnected: () => boolean,
) {
  const groups = new Map<string, CellTotals>();
  const read = manager.store.db.prepare(
    "SELECT json_extract(body,'$.configId') config,json_extract(body,'$.family') family,json_extract(body,'$.measures') measures FROM v4_samples WHERE study_id=? AND job_index>=? AND job_index<? ORDER BY job_index LIMIT 32",
  );
  for (const [i, part] of program.parts.entries()) {
    for (let start = 0; start < counts[i]; start += 32) {
      if (disconnected()) throw new Error("Téléchargement interrompu");
      const rows = read.all(part.id, start, counts[i]);
      if (rows.length !== Math.min(32, counts[i] - start))
        throw new Error("Checkpoint incomplet lors de l’export");
      for (const row of rows) {
        const configId = String(row.config),
          family = String(row.family),
          key = configId + family;
        const m = JSON.parse(String(row.measures)) as Measures;
        let cell = groups.get(key);
        if (!cell) {
          cell = {
            configId,
            family,
            games: 0,
            gameSums: {},
            turns: [],
            players: [],
          };
          groups.set(key, cell);
        }
        cell.games++;
        add(cell.gameSums, m);
        for (const t of m.turns) {
          const sums = (cell.turns[t.turn - 1] ??= {});
          add(sums, t, ["turn"] satisfies (keyof TurnMeasures)[]);
        }
        for (const p of m.byPlayer) {
          const player = (cell.players[p.player] ??= {
            player: p.player,
            sums: {},
            rankTrajectorySums: [],
          });
          add(player.sums, p, ["player"]);
          p.rankTrajectory.forEach(
            (rank, j) =>
              (player.rankTrajectorySums[j] =
                (player.rankTrajectorySums[j] ?? 0) + rank),
          );
        }
      }
      await yieldLoop();
    }
  }
  return {
    axes: {
      strategie:
        "Comparer les familles et les options à table égale. Examiner les contrastes appariés, leur précision et les témoins. La recherche de stratégies dominantes et les regrets contrefactuels restent à tester.",
      jouabilite:
        "Pertes, parades, combats, récupération, portée effective des pistes, dispersion entre sièges et progression par tour. Les parties ont une durée fixée par protocole.",
      simplicite:
        "Compter placements, révisions, changements effectifs et manipulations de jetons. Le temps, les erreurs et la charge cognitive des personnes demandent des tests humains.",
      cooperation:
        "Comparer les pertes en mondes appariés, les défenseurs décisifs, les révisions utiles et les découvertes. Séparer les joueurs privés du contrôle omniscient. Les équipes mixtes restent à tester.",
    },
    units:
      "Sommes sur les parties validées de chaque cellule. Diviser par games pour les moyennes. turns[0] correspond au premier tour et players[0] au joueur J1. Les identifiants de configuration correspondent aux cellules du manifeste.",
    cells: [...groups.values()],
  };
}
