import type { Board, Draw } from "./types";

export interface PressureRules {
  pursuit: boolean;
  partialSabotage: boolean;
}

// Build once from the board at the start of the turn, before any machine moves.
export function pursuitTargets(board: Board): number[] {
  const order = board.eyeOrder;
  const eligible = new Set(order.filter(seat => {
    const forest = board.forests[seat];
    const b = forest.machines.find(machine => machine.kind === "B")!;
    return b.hs === 0 && (forest.cells[b.position]?.stumps ?? 0) > 0;
  }));
  return order.map((_, seat) => {
    const b = board.forests[seat].machines.find(machine => machine.kind === "B")!;
    if (b.hs || eligible.size === 0) return seat;
    const start = order.indexOf(seat);
    for (let i = 0; i < order.length; i++) {
      const candidate = order[(start + i) % order.length];
      if (eligible.has(candidate)) return candidate;
    }
    return seat;
  });
}

export function redirect(draw: Draw, targets?: number[]): Draw {
  return targets && draw.tactic[0] === "B" ? { ...draw, target: targets[draw.target] } : draw;
}

// Bits 1 and 2 designate A and B respectively.
export function blockedMask(mask: number, power: number, defenders: number,
                            trap: boolean, sabotage: number, partial: boolean) {
  if (defenders > power || (defenders > 0 && trap)) return mask;
  if (defenders === 0 || !(sabotage & mask)) return 0;
  return partial ? sabotage & mask : mask;
}
