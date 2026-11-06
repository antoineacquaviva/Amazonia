import {
  BotProfileId,
  DefenderPlacementDecision,
  DefenderTrackType,
  MachineState,
  MachineType,
  PlayerForestGroup,
  SecretVillainDraw,
  SimulationConfig,
  TacticType,
} from './types';
import { SeededRNG } from './rng';
import {
  resolveTacticsTrackFromPreset,
  resolveTargetPlayerRank1Based,
} from './i18n';

export interface MachinePriorThreat {
  playerIndex: number;
  machineType: MachineType;
  machineStatus: MachineState['status'];
  currentPos: number | null;
  targetCellIfNormal: number;
  hitProbSingleDie: number;       // q(p, m) sur 1 dé inconnu
  overheatProbSingleDie: number;  // P(A2/B2 et cible p)
  assaultProbSingleDie: number;   // P(A3/B3 et cible p)
  probAtLeastOneHit: number;      // Sur N dés inconnus (ou N-1)
  probActiveRepairHit: number;    // Si machine HS : P(>= 2 hits)
  cellVulnerability: number;      // Gravité écologique en arbres menacés
  passiveBonus: number;           // Piège + Sabotage déjà présents sur c = pos + 1
  expectedLossIfUnprotected: number; // Espérance de perte écologique (I2)
}

export interface PublicPriorAnalysis {
  byPlayerAndMachine: Map<string, MachinePriorThreat>;
  sortedThreats: MachinePriorThreat[];
}

export interface Phase2ExecutionResult {
  decisions: DefenderPlacementDecision[];
  step2RevisionsCount: number;
  signaledCellsCount: number;
}

function getTargetMachineForTactic(
  group: PlayerForestGroup,
  tactic: TacticType
): MachineState {
  return tactic.startsWith('A') ? group.harvester : group.bulldozer;
}

/**
 * Compte le nombre total de jetons Furtivité (Pièges + Sabotages) actuellement actifs sur le plateau
 */
export function countActiveStealthTokensOnBoard(
  groups: PlayerForestGroup[]
): number {
  let total = 0;
  for (const g of groups) {
    if (g.harvester.status !== 'DESTROYED' && g.harvester.hasSabotage) {
      total += 1;
    }
    if (g.bulldozer.status !== 'DESTROYED' && g.bulldozer.hasSabotage) {
      total += 1;
    }
    for (const c of g.cells) {
      if (c.hasTrap) total += 1;
    }
  }
  return total;
}

/**
 * Calcule le bonus passif déjà présent sur la case suivante p+1 d'une machine NORMAL
 */
export function getExistingPassiveBonusForNextCell(
  group: PlayerForestGroup,
  machine: MachineState
): number {
  if (machine.status === 'DESTROYED' || machine.position === null) return 0;
  const targetCellIdx = machine.position + 1;
  const cell = group.cells[targetCellIdx - 1];
  let bonus = cell?.hasTrap ? 1 : 0;
  if (machine.hasSabotage && machine.status === 'NORMAL') bonus += 1;
  return bonus;
}

/**
 * Trouve une case sur la piste `group` pouvant accueillir un Défenseur Tactique dans le respect de `tacticalDefenderCap`
 */
function findValidTacticalCellOnTrack(
  group: PlayerForestGroup,
  preferredCellIdx: number,
  cap: number
): number {
  const maxIdx = group.cells.length - 1;
  const clampedPref = Math.max(1, Math.min(maxIdx, preferredCellIdx));
  if (group.cells[clampedPref - 1].tacticalDefenders < cap) {
    return clampedPref;
  }
  for (const m of [group.harvester, group.bulldozer]) {
    if (m.position !== null) {
      const altIdx = Math.max(1, Math.min(maxIdx, m.position + 1));
      if (group.cells[altIdx - 1].tacticalDefenders < cap) {
        return altIdx;
      }
    }
  }
  for (let c = 2; c <= maxIdx; c++) {
    if (group.cells[c - 1].tacticalDefenders < cap) {
      return c;
    }
  }
  return clampedPref;
}

/**
 * 1) Précalcul Probabiliste Exact (Source d'Information I2) :
 * Parcourt les 36 couples (d1, d2) in {1..6}^2, calcule M = min(d1, d2),
 * la tactique tacticsTrack[M-1] et la cible resolveTargetPlayerRank1Based(d1, d2, N) - 1,
 * et croise avec la Gravité Écologique (cellVulnerability) du plateau.
 */
export function computePublicPriorProbabilities(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  tacticsTrack?: TacticType[],
  unknownDiceCount?: number
): PublicPriorAnalysis {
  const N = config.numPlayers;
  const nUnknown = unknownDiceCount ?? N;
  const track =
    tacticsTrack && tacticsTrack.length === 6
      ? tacticsTrack
      : config.tacticsTrackPreset
      ? resolveTacticsTrackFromPreset(config.tacticsTrackPreset)
      : config.tacticsTrackSetup;

  const hitCounts = new Map<string, number>();
  const overheatCounts = new Map<string, number>();
  const assaultCounts = new Map<string, number>();

  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      const mIdx = Math.min(d1, d2);
      const tactic = track[mIdx - 1];
      const mType: MachineType = tactic.startsWith('A') ? 'A' : 'B';
      const targetP = resolveTargetPlayerRank1Based(d1, d2, N) - 1;
      const key = `${targetP}:${mType}`;

      hitCounts.set(key, (hitCounts.get(key) ?? 0) + 1);
      if (tactic === 'A2' || tactic === 'B2') {
        overheatCounts.set(key, (overheatCounts.get(key) ?? 0) + 1);
      } else if (tactic === 'A3' || tactic === 'B3') {
        assaultCounts.set(key, (assaultCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const byPlayerAndMachine = new Map<string, MachinePriorThreat>();
  const sortedThreats: MachinePriorThreat[] = [];

  for (let p = 0; p < N; p++) {
    const g = groups[p];
    for (const mType of ['A', 'B'] as const) {
      const machine = mType === 'A' ? g.harvester : g.bulldozer;
      const key = `${p}:${mType}`;
      const hits36 = hitCounts.get(key) ?? 0;
      const over36 = overheatCounts.get(key) ?? 0;
      const ass36 = assaultCounts.get(key) ?? 0;

      const q = hits36 / 36;
      const qOver = over36 / 36;
      const qAss = ass36 / 36;

      const probAtLeastOne = 1 - Math.pow(1 - q, nUnknown);
      const probZero = Math.pow(1 - q, nUnknown);
      const probOne = nUnknown * q * Math.pow(1 - q, Math.max(0, nUnknown - 1));
      const probAtLeastTwo = Math.max(0, 1 - probZero - probOne);

      const targetCellIdx = Math.max(
        1,
        Math.min(g.cells.length - 1, (machine.position ?? 1) + 1)
      );
      const cell = g.cells[targetCellIdx - 1];
      const passiveBonus = getExistingPassiveBonusForNextCell(g, machine);

      let cellVulnerability = 0;
      if (machine.status !== 'DESTROYED' && cell) {
        if (mType === 'A') {
          // Abatteuse : coupe un arbre debout (qui devient souche exposée au Bulldozer) + risque Surchauffe A2
          const treesExposed = Math.min(2, cell.standingTrees);
          const bulldozerNearby =
            g.bulldozer.status === 'NORMAL' &&
            g.bulldozer.position === machine.position
              ? 0.65
              : 0.25;
          cellVulnerability =
            (treesExposed > 0 ? 1.15 + bulldozerNearby : 0.2) +
            (qOver / Math.max(0.01, q)) * 0.85;
        } else {
          // Bulldozer : très haute gravité si cell.stumps >= 1 (rase toutes les souches et annule la Régénération !)
          // ou si cell.stumps == 0 et bulldozerZeroStumpAction === 'DESTROY_TREE' (détruit définitivement 1 arbre debout)
          if (cell.stumps >= 1) {
            cellVulnerability = 1.85 + cell.stumps * 0.55 + (qOver / Math.max(0.01, q)) * 0.8;
          } else if (
            config.bulldozerZeroStumpAction === 'DESTROY_TREE' &&
            cell.standingTrees >= 1
          ) {
            cellVulnerability = 1.55 + (qOver / Math.max(0.01, q)) * 0.75;
          } else {
            cellVulnerability = 0.25;
          }
        }
      }

      const activeAttackProb =
        machine.status === 'NORMAL'
          ? probAtLeastOne
          : machine.status === 'HS'
          ? probAtLeastTwo
          : 0;

      // Bonus de synergie si la case a déjà un Piège ou un Sabotage
      const synergyMultiplier =
        passiveBonus >= 1
          ? config.parryHsRule !== 'STANDARD_S3'
            ? 1.45
            : 1.25
          : 1.0;

      const expectedLossIfUnprotected =
        activeAttackProb * cellVulnerability * synergyMultiplier;

      const entry: MachinePriorThreat = {
        playerIndex: p,
        machineType: mType,
        machineStatus: machine.status,
        currentPos: machine.position,
        targetCellIfNormal: targetCellIdx,
        hitProbSingleDie: q,
        overheatProbSingleDie: qOver,
        assaultProbSingleDie: qAss,
        probAtLeastOneHit: probAtLeastOne,
        probActiveRepairHit: probAtLeastTwo,
        cellVulnerability,
        passiveBonus,
        expectedLossIfUnprotected,
      };

      byPlayerAndMachine.set(key, entry);
      sortedThreats.push(entry);
    }
  }

  sortedThreats.sort(
    (a, b) => b.expectedLossIfUnprotected - a.expectedLossIfUnprotected
  );

  return { byPlayerAndMachine, sortedThreats };
}

/**
 * Calcule le seuil de Mise HS sur une case en tenant compte de parryHsRule
 */
export function computeEffectiveHsThreshold(
  config: SimulationConfig,
  assaultK: number,
  passiveBonus: number
): number {
  const shift = config.combatThresholdShift || 0;
  const parryS = 2 + assaultK + shift;
  const standardHsS = 3 + assaultK + shift;
  if (config.parryHsRule !== 'STANDARD_S3' && passiveBonus >= 1) {
    return parryS;
  }
  return standardHsS;
}

/**
 * Exécute la Phase 2 (Étape 2.1 + Étape 2.2) avec suivi détaillé des révisions 2.2
 */
export function executePhase2BotsDetailed(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[],
  botProfiles: BotProfileId[],
  rng: SeededRNG
): Phase2ExecutionResult {
  const N = config.numPlayers;

  // 7. Si toute la table est OMNISCIENT, on utilise le planificateur global Omniscient
  if (botProfiles.every((b) => b === 'OMNISCIENT')) {
    const omniDecisions = executeOmniscientTeamPhase2(config, groups, draws);
    return {
      decisions: omniDecisions,
      step2RevisionsCount: 0,
      signaledCellsCount: N,
    };
  }

  const priorsFull = computePublicPriorProbabilities(
    config,
    groups,
    undefined,
    N
  );
  const priorsNMinus1 = computePublicPriorProbabilities(
    config,
    groups,
    undefined,
    Math.max(1, N - 1)
  );

  const existingStealthTokens = countActiveStealthTokensOnBoard(groups);
  const maxNewStealthTokensAllowed = Math.max(0, N - existingStealthTokens);

  // ==========================================================================
  // ÉTAPE 2.1 : Pose simultanée du 1er jeton sur sa propre piste P = k (sans biais d'ordre)
  // ==========================================================================
  const step1Decisions = executeStep21Simultaneous(
    config,
    groups,
    draws,
    botProfiles,
    priorsFull,
    priorsNMinus1,
    maxNewStealthTokensAllowed,
    rng
  );

  // ==========================================================================
  // ÉTAPE 2.2 : Pose du 2e jeton sur P != k avec Boucle Systémique de Révision (R = 1..4)
  // ==========================================================================
  const { step2Decisions, step2RevisionsCount, signaledCellsCount } =
    executeStep22IterativeRevision(
      config,
      groups,
      draws,
      botProfiles,
      step1Decisions,
      priorsFull,
      priorsNMinus1,
      maxNewStealthTokensAllowed,
      rng
    );

  return {
    decisions: [...step1Decisions, ...step2Decisions],
    step2RevisionsCount,
    signaledCellsCount,
  };
}

/**
 * Wrapper rétrocompatible retournant la liste des 2N décisions de placement
 */
export function executePhase2Bots(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[],
  botProfiles: BotProfileId[],
  rng: SeededRNG
): DefenderPlacementDecision[] {
  return executePhase2BotsDetailed(config, groups, draws, botProfiles, rng)
    .decisions;
}

/**
 * ÉTAPE 2.1 SIMULTANÉE SANS BIAIS D'ORDRE (k = 0..N-1)
 */
function executeStep21Simultaneous(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[],
  botProfiles: BotProfileId[],
  priorsFull: PublicPriorAnalysis,
  priorsNMinus1: PublicPriorAnalysis,
  maxNewStealthTokensAllowed: number,
  rng: SeededRNG
): DefenderPlacementDecision[] {
  const N = config.numPlayers;
  const cap = config.tacticalDefenderCap;
  const shift = config.combatThresholdShift;

  interface Step1Intent {
    playerIndex: number;
    profile: BotProfileId;
    preferredTrack: DefenderTrackType;
    preferredCell: number;
    stealthPriorityScore: number;
    fallbackTacticalCell: number;
    reason: string;
    fallbackReason: string;
    isSignalOnRealSelfThreat: boolean;
  }

  const intents: Step1Intent[] = [];

  for (let k = 0; k < N; k++) {
    const profile = botProfiles[k % botProfiles.length];
    const ownGroup = groups[k];
    const ownDraw = draws[k];

    const threatA = priorsFull.byPlayerAndMachine.get(`${k}:A`)!;
    const threatB = priorsFull.byPlayerAndMachine.get(`${k}:B`)!;
    const bestPriorMachine =
      threatB.expectedLossIfUnprotected > threatA.expectedLossIfUnprotected
        ? threatB
        : threatA;
    const bestPriorCell = findValidTacticalCellOnTrack(
      ownGroup,
      bestPriorMachine.targetCellIfNormal,
      cap
    );

    if (profile === 'BLIND') {
      // 1. BLIND : Aucune info (I1=0, I2=0, I3=0)
      // Choisit naïvement une case de sa piste sans lire ni son dé, ni les probabilités de l'Œil/Tactiques, ni l'état HS/Souches
      const basePos =
        ownGroup.harvester.position ?? ownGroup.bulldozer.position ?? 1;
      const naiveOffset = rng.nextInt(1, 2); // Hésitation naïve entre p+1 et p+2
      const chosenCell = findValidTacticalCellOnTrack(
        ownGroup,
        basePos + naiveOffset,
        cap
      );
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'TACTICAL',
        preferredCell: chosenCell,
        stealthPriorityScore: -1,
        fallbackTacticalCell: chosenCell,
        reason: `[1.Aveugle 2.1] Pose naïve sans lecture de dé ni des pistes en c=${chosenCell}`,
        fallbackReason: `[1.Aveugle 2.1] Pose naïve en c=${chosenCell}`,
        isSignalOnRealSelfThreat: false,
      });
      continue;
    }

    if (profile === 'PROB_ONLY') {
      // 2. PROB_ONLY : Lecture probabiliste I2 seule (I1=0, I3=0)
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'TACTICAL',
        preferredCell: bestPriorCell,
        stealthPriorityScore: -1,
        fallbackTacticalCell: bestPriorCell,
        reason: `[2.ProbSeule 2.1] I2 cible Machine ${bestPriorMachine.machineType} (E[perte]=${bestPriorMachine.expectedLossIfUnprotected.toFixed(2)}) en c=${bestPriorCell}`,
        fallbackReason: `[2.ProbSeule 2.1] Garde probabiliste I2 en c=${bestPriorCell}`,
        isSignalOnRealSelfThreat: false,
      });
      continue;
    }

    if (profile === 'SOLO_INFORMED') {
      // 3. SOLO_INFORMED : I1 + I2, mais zéro coordination (I3=0)
      const drawnMachine = getTargetMachineForTactic(ownGroup, ownDraw.tactic);
      if (
        ownDraw.targetPlayerIndex === k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        const c = findValidTacticalCellOnTrack(
          ownGroup,
          drawnMachine.position + 1,
          cap
        );
        intents.push({
          playerIndex: k,
          profile,
          preferredTrack: 'TACTICAL',
          preferredCell: c,
          stealthPriorityScore: -1,
          fallbackTacticalCell: c,
          reason: `[3.Solo 2.1] I1 Dé privé (${ownDraw.tactic}) cible sa machine ${drawnMachine.type} NORMAL -> Tactique en c=${c}`,
          fallbackReason: `[3.Solo 2.1] Tactique en c=${c}`,
          isSignalOnRealSelfThreat: true,
        });
      } else {
        const threatAN1 = priorsNMinus1.byPlayerAndMachine.get(`${k}:A`)!;
        const threatBN1 = priorsNMinus1.byPlayerAndMachine.get(`${k}:B`)!;
        const bestM =
          threatBN1.expectedLossIfUnprotected >
          threatAN1.expectedLossIfUnprotected
            ? threatBN1
            : threatAN1;
        const c = findValidTacticalCellOnTrack(
          ownGroup,
          bestM.targetCellIfNormal,
          cap
        );
        intents.push({
          playerIndex: k,
          profile,
          preferredTrack: 'TACTICAL',
          preferredCell: c,
          stealthPriorityScore: -1,
          fallbackTacticalCell: c,
          reason: `[3.Solo 2.1] Dé privé sur J${ownDraw.targetPlayerIndex + 1} -> repli probabiliste I2 sur Machine ${bestM.machineType} en c=${c}`,
          fallbackReason: `[3.Solo 2.1] Repli I2 en c=${c}`,
          isSignalOnRealSelfThreat: false,
        });
      }
      continue;
    }

    // ========================================================================
    // PROFILS COORDONNÉS : COORD_NO_DICE (I2+I3), COORD_ONE_SHOT (I1+I2+I3 R=1), COORD_HYBRID (I1+I2+I3 R=4)
    // ========================================================================
    const usesPrivateDie = profile !== 'COORD_NO_DICE';
    const drawnMachine = getTargetMachineForTactic(ownGroup, ownDraw.tactic);
    const isAssaultDraw =
      ownDraw.tactic === 'A3' || ownDraw.tactic === 'B3' ? 1 : 0;
    const selfTargetedNormal =
      usesPrivateDie &&
      ownDraw.targetPlayerIndex === k &&
      drawnMachine.status === 'NORMAL' &&
      drawnMachine.position !== null;

    if (selfTargetedNormal && drawnMachine.position !== null) {
      const targetC = drawnMachine.position + 1;
      const passiveBonus = getExistingPassiveBonusForNextCell(
        ownGroup,
        drawnMachine
      );
      const maxPossibleTacticalS = cap + passiveBonus;
      const minNeededForParry = 2 + isAssaultDraw + shift;

      if (maxPossibleTacticalS >= minNeededForParry) {
        const validC = findValidTacticalCellOnTrack(ownGroup, targetC, cap);
        intents.push({
          playerIndex: k,
          profile,
          preferredTrack: 'TACTICAL',
          preferredCell: validC,
          stealthPriorityScore: -1,
          fallbackTacticalCell: validC,
          reason: `[${profile === 'COORD_ONE_SHOT' ? '5.Coord1P' : '6.CoordRév'} 2.1] Signal Tactique I1 (${ownDraw.tactic}) sur sa piste en c=${validC}`,
          fallbackReason: `[Coord 2.1] Signal Tactique en c=${validC}`,
          isSignalOnRealSelfThreat: true,
        });
      } else {
        // Le plafond Cap ne permet pas de parer en Tactique sans Piège/Sabotage -> appel Furtivité (1/2) en c pour saboter la machine après l'attaque !
        intents.push({
          playerIndex: k,
          profile,
          preferredTrack: 'STEALTH',
          preferredCell: targetC,
          stealthPriorityScore: 100 + bestPriorMachine.expectedLossIfUnprotected,
          fallbackTacticalCell: findValidTacticalCellOnTrack(
            ownGroup,
            targetC,
            cap
          ),
          reason: `[${profile === 'COORD_ONE_SHOT' ? '5.Coord1P' : '6.CoordRév'} 2.1] Assaut sous Cap=${cap} -> Signal Furtivité (1/2) en c=${targetC} pour Sabotage`,
          fallbackReason: `[Coord 2.1] Garde Tactique en c=${targetC}`,
          isSignalOnRealSelfThreat: true,
        });
      }
      continue;
    }

    // Cas où le joueur n'a pas de menace directe vue sur son dé (soit P_k != k, soit COORD_NO_DICE)
    // 1) Si une machine NORMAL a déjà un Piège ou un Sabotage (passiveBonus >= 1) et une forte probabilité I2,
    // ou si COORD_NO_DICE voit une probabilité d'attaque très élevée (ex. J1/J2 avec souches), il pose en Tactique :
    const harvBonus = getExistingPassiveBonusForNextCell(
      ownGroup,
      ownGroup.harvester
    );
    const bullBonus = getExistingPassiveBonusForNextCell(
      ownGroup,
      ownGroup.bulldozer
    );

    if (
      ownGroup.bulldozer.status === 'NORMAL' &&
      ownGroup.bulldozer.position !== null &&
      bullBonus >= 1 &&
      cap + bullBonus >= 2 + shift &&
      threatB.probAtLeastOneHit >= 0.28
    ) {
      const c = findValidTacticalCellOnTrack(
        ownGroup,
        ownGroup.bulldozer.position + 1,
        cap
      );
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'TACTICAL',
        preferredCell: c,
        stealthPriorityScore: -1,
        fallbackTacticalCell: c,
        reason: `[Coord 2.1] Valorise Piège/Sabotage (+${bullBonus}) devant Bulldozer en c=${c}`,
        fallbackReason: `[Coord 2.1] Tactique en c=${c}`,
        isSignalOnRealSelfThreat: false,
      });
      continue;
    }

    if (
      ownGroup.harvester.status === 'NORMAL' &&
      ownGroup.harvester.position !== null &&
      harvBonus >= 1 &&
      cap + harvBonus >= 2 + shift &&
      threatA.probAtLeastOneHit >= 0.28
    ) {
      const c = findValidTacticalCellOnTrack(
        ownGroup,
        ownGroup.harvester.position + 1,
        cap
      );
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'TACTICAL',
        preferredCell: c,
        stealthPriorityScore: -1,
        fallbackTacticalCell: c,
        reason: `[Coord 2.1] Valorise Piège/Sabotage (+${harvBonus}) devant Abatteuse en c=${c}`,
        fallbackReason: `[Coord 2.1] Tactique en c=${c}`,
        isSignalOnRealSelfThreat: false,
      });
      continue;
    }

    // Si COORD_NO_DICE (sans dé I1) et que sa piste a une espérance de perte I2 critique (ex. J1 ou J2 avec souche exposée au Bulldozer)
    // ET que cap + passiveBonus >= 2 + shift, il émet un appel Tactique probabiliste sur sa machine la plus menacée :
    if (
      profile === 'COORD_NO_DICE' &&
      bestPriorMachine.expectedLossIfUnprotected >= 0.95 &&
      cap + bestPriorMachine.passiveBonus >= 2 + shift
    ) {
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'TACTICAL',
        preferredCell: bestPriorCell,
        stealthPriorityScore: -1,
        fallbackTacticalCell: bestPriorCell,
        reason: `[4.CoordSansDé 2.1] Appel Tactique probabiliste I2 sur Machine ${bestPriorMachine.machineType} (E[perte]=${bestPriorMachine.expectedLossIfUnprotected.toFixed(2)}) en c=${bestPriorCell}`,
        fallbackReason: `[4.CoordSansDé 2.1] Garde Tactique I2 en c=${bestPriorCell}`,
        isSignalOnRealSelfThreat: false,
      });
      continue;
    }

    // Sinon : candidat à l'ouverture d'un appel Furtivité (1/2) en p+1 pour préparer un Piège ou un Sabotage !
    let stealthCell = bestPriorMachine.targetCellIfNormal;
    if (ownGroup.cells[stealthCell - 1]?.hasTrap) {
      const altMachine =
        bestPriorMachine.machineType === 'A' ? threatB : threatA;
      if (!ownGroup.cells[altMachine.targetCellIfNormal - 1]?.hasTrap) {
        stealthCell = altMachine.targetCellIfNormal;
      }
    }
    const safeStealthCell = Math.max(
      1,
      Math.min(ownGroup.cells.length - 1, stealthCell)
    );
    const alreadyTrapped = ownGroup.cells[safeStealthCell - 1]?.hasTrap;

    if (!alreadyTrapped) {
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'STEALTH',
        preferredCell: safeStealthCell,
        stealthPriorityScore: bestPriorMachine.expectedLossIfUnprotected,
        fallbackTacticalCell: bestPriorCell,
        reason: `[Coord 2.1] Appel Furtivité (1/2) en c=${safeStealthCell} (score I2=${bestPriorMachine.expectedLossIfUnprotected.toFixed(2)})`,
        fallbackReason: `[Coord 2.1] Garde Tactique I2 en c=${bestPriorCell}`,
        isSignalOnRealSelfThreat: false,
      });
    } else {
      intents.push({
        playerIndex: k,
        profile,
        preferredTrack: 'TACTICAL',
        preferredCell: bestPriorCell,
        stealthPriorityScore: -1,
        fallbackTacticalCell: bestPriorCell,
        reason: `[Coord 2.1] Case déjà piégée -> Garde Tactique I2 en c=${bestPriorCell}`,
        fallbackReason: `[Coord 2.1] Garde Tactique I2 en c=${bestPriorCell}`,
        isSignalOnRealSelfThreat: false,
      });
    }
  }

  // Résolution simultanée sans biais d'ordre :
  // On trie les demandes d'ouverture de Furtivité par stealthPriorityScore décroissant
  // On limite aussi le nombre d'ouvertures Furtivité 2.1 à ce que l'équipe peut réellement compléter en 2.2
  // (Au maximum floor(N / 2) ou maxNewStealthTokensAllowed pour éviter d'ouvrir trop d'appels 1/2 quand les alliés doivent aussi parer des menaces !)
  const tacticalSignalCount = intents.filter(
    (it) => it.preferredTrack === 'TACTICAL' && it.isSignalOnRealSelfThreat
  ).length;
  const maxCompletableStealthInStep2 = Math.max(
    0,
    Math.min(
      maxNewStealthTokensAllowed,
      N - tacticalSignalCount,
      Math.ceil(N * 0.65)
    )
  );

  const stealthCandidates = intents
    .filter((it) => it.preferredTrack === 'STEALTH')
    .sort((a, b) => b.stealthPriorityScore - a.stealthPriorityScore);

  const approvedStealthPlayers = new Set<number>();
  for (
    let i = 0;
    i < stealthCandidates.length &&
    approvedStealthPlayers.size < maxCompletableStealthInStep2;
    i++
  ) {
    approvedStealthPlayers.add(stealthCandidates[i].playerIndex);
  }

  const decisions: DefenderPlacementDecision[] = [];
  for (let k = 0; k < N; k++) {
    const it = intents[k];
    const ownGroup = groups[k];
    let finalTrack: DefenderTrackType = it.preferredTrack;
    let finalCell = it.preferredCell;
    let finalReason = it.reason;

    if (
      finalTrack === 'STEALTH' &&
      !approvedStealthPlayers.has(it.playerIndex)
    ) {
      finalTrack = 'TACTICAL';
      finalCell = it.fallbackTacticalCell;
      finalReason = it.fallbackReason;
    }

    const safeCell = Math.max(
      1,
      Math.min(ownGroup.cells.length - 1, finalCell)
    );
    if (finalTrack === 'TACTICAL') {
      ownGroup.cells[safeCell - 1].tacticalDefenders += 1;
    } else {
      ownGroup.cells[safeCell - 1].stealthDefenders += 1;
    }

    decisions.push({
      playerIndex: k,
      step: 1,
      targetPlayerIndex: k,
      cellIndex: safeCell,
      track: finalTrack,
      reason: finalReason,
      revisionsRound: 1,
    });
  }

  return decisions;
}

/**
 * ÉTAPE 2.2 AVEC BOUCLE SYSTÉMIQUE DE RÉVISION ITÉRATIVE (R = 1..4)
 */
function executeStep22IterativeRevision(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[],
  botProfiles: BotProfileId[],
  step1Decisions: DefenderPlacementDecision[],
  priorsFull: PublicPriorAnalysis,
  priorsNMinus1: PublicPriorAnalysis,
  maxNewStealthTokensAllowed: number,
  rng: SeededRNG
): {
  step2Decisions: DefenderPlacementDecision[];
  step2RevisionsCount: number;
  signaledCellsCount: number;
} {
  const N = config.numPlayers;
  const cap = config.tacticalDefenderCap;
  const shift = config.combatThresholdShift;

  interface TempToken22 {
    playerIndex: number;
    profile: BotProfileId;
    targetPlayerIndex: number;
    cellIndex: number;
    track: DefenderTrackType;
    reason: string;
    isPrivateDieSignalOnAlly: boolean; // Vrai si ce jeton 2.2 provient du dé privé P_k != k du joueur k !
    knownAssaultOnTarget: number;
    revisionsRound: number;
  }

  // Helper pour retirer ou appliquer un jeton 2.2 sur groups
  const applyToken = (tk: TempToken22, delta: 1 | -1) => {
    const g = groups[tk.targetPlayerIndex];
    const cell = g?.cells[tk.cellIndex - 1];
    if (!cell) return;
    if (tk.track === 'TACTICAL') {
      cell.tacticalDefenders = Math.max(0, cell.tacticalDefenders + delta);
    } else {
      cell.stealthDefenders = Math.max(0, cell.stealthDefenders + delta);
    }
  };

  // Helper pour compter combien de paires Furtivité (>= 2 jetons) ou d'appels (1 jeton) sont sur le plateau
  const countStealthPairsOnBoard = (): number => {
    let pairs = 0;
    for (const g of groups) {
      for (const c of g.cells) {
        if (c.stealthDefenders >= 2) pairs += 1;
      }
    }
    return pairs;
  };

  // ==========================================================================
  // RONDE r = 1 : Pose initiale du 2e jeton (Simultanée pour les profils 1-Passe, séquentielle/initiale pour les autres)
  // ==========================================================================
  // Note importante pour COORD_ONE_SHOT :
  // En COORD_ONE_SHOT (R=1 sans révision), chaque joueur pose son 2e jeton sur la base de l'état de fin d'Étape 2.1
  // sans connaître les 2es jetons des autres joueurs !
  // On sauvegarde donc une photographie des compteurs de fin d'Étape 2.1 pour que COORD_ONE_SHOT, SOLO_INFORMED, PROB_ONLY et BLIND
  // prennent leur décision de Ronde 1 uniquement sur l'information disponible après 2.1.
  const step1Snapshot = groups.map((g) =>
    g.cells.map((c) => ({
      tacticalDefenders: c.tacticalDefenders,
      stealthDefenders: c.stealthDefenders,
      hasTrap: c.hasTrap,
    }))
  );

  const tokens22: TempToken22[] = [];
  let signaledCellsCount = step1Decisions.filter(
    (d) => d.reason.includes('Signal') || d.reason.includes('Appel')
  ).length;

  for (let k = 0; k < N; k++) {
    const profile = botProfiles[k % botProfiles.length];
    const ownDraw = draws[k];

    if (profile === 'BLIND') {
      // 1. BLIND : Pose mécaniquement sur le joueur voisin (k + 1) % N sans lire ni dé, ni probabilités, ni alliés
      const targetP = (k + 1) % N;
      const g = groups[targetP];
      const basePos = g.harvester.position ?? g.bulldozer.position ?? 1;
      const naiveOffset = rng.nextInt(1, 2);
      const chosenCell = findValidTacticalCellOnTrack(
        g,
        basePos + naiveOffset,
        cap
      );
      tokens22.push({
        playerIndex: k,
        profile,
        targetPlayerIndex: targetP,
        cellIndex: chosenCell,
        track: 'TACTICAL',
        reason: `[1.Aveugle 2.2] Soutien mécanique aveugle sur J${targetP + 1} en c=${chosenCell}`,
        isPrivateDieSignalOnAlly: false,
        knownAssaultOnTarget: 0,
        revisionsRound: 1,
      });
      continue;
    }

    if (profile === 'PROB_ONLY') {
      // 2. PROB_ONLY : Choisit la piste alliée p != k ayant la plus forte espérance de perte I2 (sans lire son dé ni les jetons alliés)
      const bestAllyThreat = priorsFull.sortedThreats.find(
        (t) => t.playerIndex !== k
      )!;
      const targetP = bestAllyThreat.playerIndex;
      const g = groups[targetP];
      const chosenCell = findValidTacticalCellOnTrack(
        g,
        bestAllyThreat.targetCellIfNormal,
        cap
      );
      tokens22.push({
        playerIndex: k,
        profile,
        targetPlayerIndex: targetP,
        cellIndex: chosenCell,
        track: 'TACTICAL',
        reason: `[2.ProbSeule 2.2] I2 cible J${targetP + 1} Machine ${bestAllyThreat.machineType} (E[perte]=${bestAllyThreat.expectedLossIfUnprotected.toFixed(2)}) en c=${chosenCell}`,
        isPrivateDieSignalOnAlly: false,
        knownAssaultOnTarget: 0,
        revisionsRound: 1,
      });
      continue;
    }

    if (profile === 'SOLO_INFORMED') {
      // 3. SOLO_INFORMED : Utilise I1 (si P_k != k) + I2, sans lire les jetons alliés (I3=0)
      const drawnP = ownDraw.targetPlayerIndex;
      const drawnGroup = groups[drawnP];
      const drawnMachine = getTargetMachineForTactic(drawnGroup, ownDraw.tactic);

      if (
        drawnP !== k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        const chosenCell = findValidTacticalCellOnTrack(
          drawnGroup,
          drawnMachine.position + 1,
          cap
        );
        tokens22.push({
          playerIndex: k,
          profile,
          targetPlayerIndex: drawnP,
          cellIndex: chosenCell,
          track: 'TACTICAL',
          reason: `[3.Solo 2.2] I1 Dé privé (${ownDraw.tactic} -> J${drawnP + 1}) : Tactique en c=${chosenCell} sans coordination`,
          isPrivateDieSignalOnAlly: true,
          knownAssaultOnTarget:
            ownDraw.tactic === 'A3' || ownDraw.tactic === 'B3' ? 1 : 0,
          revisionsRound: 1,
        });
      } else {
        const bestAllyThreat = priorsNMinus1.sortedThreats.find(
          (t) => t.playerIndex !== k
        )!;
        const targetP = bestAllyThreat.playerIndex;
        const chosenCell = findValidTacticalCellOnTrack(
          groups[targetP],
          bestAllyThreat.targetCellIfNormal,
          cap
        );
        tokens22.push({
          playerIndex: k,
          profile,
          targetPlayerIndex: targetP,
          cellIndex: chosenCell,
          track: 'TACTICAL',
          reason: `[3.Solo 2.2] Repli probabiliste I2 sur J${targetP + 1} (${bestAllyThreat.machineType}) en c=${chosenCell}`,
          isPrivateDieSignalOnAlly: false,
          knownAssaultOnTarget: 0,
          revisionsRound: 1,
        });
      }
      continue;
    }

    // ========================================================================
    // RONDE 1 POUR COORD_NO_DICE, COORD_ONE_SHOT, COORD_HYBRID
    // ========================================================================
    const usesPrivateDie = profile !== 'COORD_NO_DICE';
    const drawnP = ownDraw.targetPlayerIndex;
    const drawnGroup = groups[drawnP];
    const drawnMachine = getTargetMachineForTactic(drawnGroup, ownDraw.tactic);
    const isKnownAssault =
      usesPrivateDie && (ownDraw.tactic === 'A3' || ownDraw.tactic === 'B3')
        ? 1
        : 0;

    // 1) Si le bot possède I1 (COORD_ONE_SHOT ou COORD_HYBRID) et que son dé privé cible une machine NORMAL d'un allié P_k != k :
    if (
      usesPrivateDie &&
      drawnP !== k &&
      drawnMachine.status === 'NORMAL' &&
      drawnMachine.position !== null
    ) {
      const cIdx = drawnMachine.position + 1;
      const snapCell = step1Snapshot[drawnP][cIdx - 1];
      const passiveBonus = getExistingPassiveBonusForNextCell(
        drawnGroup,
        drawnMachine
      );
      const maxReachableS = cap + passiveBonus;
      const neededParryS = 2 + isKnownAssault + shift;
      const neededHsS = computeEffectiveHsThreshold(
        config,
        isKnownAssault,
        passiveBonus
      );
      const currentS = (snapCell?.tacticalDefenders ?? 0) + passiveBonus;

      if (
        snapCell &&
        snapCell.tacticalDefenders < cap &&
        currentS < neededHsS &&
        maxReachableS >= neededParryS
      ) {
        // Pose son 2e jeton temporaire en TACTICAL sur (drawnP, cIdx).
        // Même si snapCell.tacticalDefenders === 0 en 2.1, ce jeton temporaire en 2.2 (Ronde 1)
        // sert de SIGNAL D'ALERTE 2.2 aux coéquipiers lors des rondes de révision r >= 2 !
        signaledCellsCount += 1;
        tokens22.push({
          playerIndex: k,
          profile,
          targetPlayerIndex: drawnP,
          cellIndex: cIdx,
          track: 'TACTICAL',
          reason: `[${profile === 'COORD_ONE_SHOT' ? '5.Coord1P' : '6.CoordRév'} 2.2 R1] Signal/Renfort I1 (${ownDraw.tactic} -> J${drawnP + 1}) en c=${cIdx}`,
          isPrivateDieSignalOnAlly: true,
          knownAssaultOnTarget: isKnownAssault,
          revisionsRound: 1,
        });
        continue;
      } else if (snapCell && snapCell.stealthDefenders === 1) {
        tokens22.push({
          playerIndex: k,
          profile,
          targetPlayerIndex: drawnP,
          cellIndex: cIdx,
          track: 'STEALTH',
          reason: `[${profile === 'COORD_ONE_SHOT' ? '5.Coord1P' : '6.CoordRév'} 2.2 R1] Complète Furtivité (2/2) sur case attaquée J${drawnP + 1} c=${cIdx}`,
          isPrivateDieSignalOnAlly: true,
          knownAssaultOnTarget: isKnownAssault,
          revisionsRound: 1,
        });
        continue;
      }
    }

    // 2) Sinon (pas de cible directe I1 sur un allié, ou COORD_NO_DICE) :
    // Cherche la meilleure action de soutien sur l'état de fin d'Étape 2.1 (step1Snapshot) :
    // (a) Compléter un Signal Tactique 2.1 (ou valoriser un Piège/Sabotage) pour atteindre Parade ou Mise HS
    let bestTacticalSupport: {
      pIdx: number;
      cIdx: number;
      score: number;
      reason: string;
    } | null = null;

    for (let pIdx = 0; pIdx < N; pIdx++) {
      if (pIdx === k) continue;
      const g = groups[pIdx];
      for (const mType of ['A', 'B'] as const) {
        const m = mType === 'A' ? g.harvester : g.bulldozer;
        if (m.status !== 'NORMAL' || m.position === null) continue;
        const cIdx = m.position + 1;
        const snapCell = step1Snapshot[pIdx][cIdx - 1];
        if (!snapCell || snapCell.tacticalDefenders >= cap) continue;

        const passiveBonus = getExistingPassiveBonusForNextCell(g, m);
        const currentS = snapCell.tacticalDefenders + passiveBonus;
        const hsThreshold = computeEffectiveHsThreshold(
          config,
          0,
          passiveBonus
        );
        const parryThreshold = 2 + shift;
        const prior = priorsFull.byPlayerAndMachine.get(`${pIdx}:${mType}`)!;
        const step1Dec = step1Decisions[pIdx];
        const hasStep1TacticalSignal =
          step1Dec.track === 'TACTICAL' &&
          step1Dec.cellIndex === cIdx &&
          step1Dec.reason.includes('Signal');

        if (currentS < hsThreshold && cap + passiveBonus >= parryThreshold) {
          let utility = prior.expectedLossIfUnprotected;
          if (hasStep1TacticalSignal) utility += 3.5; // Signal 2.1 explicite !
          if (currentS + 1 === parryThreshold) utility += 2.2; // Permet d'atteindre la Parade !
          if (currentS + 1 >= hsThreshold) utility += 1.8; // Permet d'atteindre la Mise HS !

          if (!bestTacticalSupport || utility > bestTacticalSupport.score) {
            bestTacticalSupport = {
              pIdx,
              cIdx,
              score: utility,
              reason: `[Coord 2.2 R1] Soutien Tactique sur J${pIdx + 1} c=${cIdx} (S->${currentS + 1})`,
            };
          }
        }
      }
    }

    // (b) Cherche un appel Furtivité 2.1 (stealthDefenders === 1 dans step1Snapshot)
    let bestStealthSupport: {
      pIdx: number;
      cIdx: number;
      score: number;
      reason: string;
    } | null = null;

    for (let pIdx = 0; pIdx < N; pIdx++) {
      if (pIdx === k) continue;
      const g = groups[pIdx];
      for (const cell of g.cells) {
        const snapCell = step1Snapshot[pIdx][cell.cellIndex - 1];
        if (snapCell && snapCell.stealthDefenders === 1) {
          const priorA = priorsFull.byPlayerAndMachine.get(`${pIdx}:A`)!;
          const priorB = priorsFull.byPlayerAndMachine.get(`${pIdx}:B`)!;
          const score =
            2.4 +
            Math.max(
              priorA.expectedLossIfUnprotected,
              priorB.expectedLossIfUnprotected
            );
          if (!bestStealthSupport || score > bestStealthSupport.score) {
            bestStealthSupport = {
              pIdx,
              cIdx: cell.cellIndex,
              score,
              reason: `[Coord 2.2 R1] Réponse à l'appel Furtivité (1/2) de J${pIdx + 1} en c=${cell.cellIndex}`,
            };
          }
        }
      }
    }

    if (
      bestTacticalSupport &&
      (!bestStealthSupport ||
        bestTacticalSupport.score >= bestStealthSupport.score)
    ) {
      tokens22.push({
        playerIndex: k,
        profile,
        targetPlayerIndex: bestTacticalSupport.pIdx,
        cellIndex: bestTacticalSupport.cIdx,
        track: 'TACTICAL',
        reason: bestTacticalSupport.reason,
        isPrivateDieSignalOnAlly: false,
        knownAssaultOnTarget: 0,
        revisionsRound: 1,
      });
    } else if (bestStealthSupport) {
      tokens22.push({
        playerIndex: k,
        profile,
        targetPlayerIndex: bestStealthSupport.pIdx,
        cellIndex: bestStealthSupport.cIdx,
        track: 'STEALTH',
        reason: bestStealthSupport.reason,
        isPrivateDieSignalOnAlly: false,
        knownAssaultOnTarget: 0,
        revisionsRound: 1,
      });
    } else {
      const fallbackThreat = priorsFull.sortedThreats.find(
        (t) => t.playerIndex !== k
      )!;
      const targetP = fallbackThreat.playerIndex;
      const chosenCell = findValidTacticalCellOnTrack(
        groups[targetP],
        fallbackThreat.targetCellIfNormal,
        cap
      );
      tokens22.push({
        playerIndex: k,
        profile,
        targetPlayerIndex: targetP,
        cellIndex: chosenCell,
        track: 'TACTICAL',
        reason: `[Coord 2.2 R1] Couverture probabiliste I2 sur J${targetP + 1} en c=${chosenCell}`,
        isPrivateDieSignalOnAlly: false,
        knownAssaultOnTarget: 0,
        revisionsRound: 1,
      });
    }
  }

  // Appliquer tous les jetons de la Ronde 1 sur le plateau
  for (const tk of tokens22) {
    applyToken(tk, 1);
  }

  // Si aucun joueur sur la table n'utilise la boucle de révision (BLIND, PROB_ONLY, SOLO_INFORMED, COORD_ONE_SHOT),
  // on s'arrête immédiatement après la Ronde 1 !
  const hasRevisableBots = botProfiles.some(
    (b) => b === 'COORD_HYBRID' || b === 'COORD_NO_DICE'
  );
  if (!hasRevisableBots) {
    const finalDecisions = tokens22.map((tk) => ({
      playerIndex: tk.playerIndex,
      step: 2 as const,
      targetPlayerIndex: tk.targetPlayerIndex,
      cellIndex: tk.cellIndex,
      track: tk.track,
      reason: tk.reason,
      revisionsRound: 1,
    }));
    return {
      step2Decisions: finalDecisions,
      step2RevisionsCount: 0,
      signaledCellsCount,
    };
  }

  // ==========================================================================
  // RONDES DE RÉVISION ITÉRATIVE r = 2..4 (POUR COORD_NO_DICE ET COORD_HYBRID)
  // ==========================================================================
  let step2RevisionsCount = 0;
  const R_MAX = 4;

  // Ensemble des cases ayant reçu un signal d'alerte (en 2.1 ou en 2.2 Ronde 1 par un dé privé I1)
  const realThreatSignals = new Map<string, { assaultK: number }>();
  for (let p = 0; p < N; p++) {
    const d1 = step1Decisions[p];
    if (d1.reason.includes('Signal') || d1.reason.includes('Appel Tactique')) {
      const isAss =
        botProfiles[p] !== 'COORD_NO_DICE' &&
        (draws[p].tactic === 'A3' || draws[p].tactic === 'B3')
          ? 1
          : 0;
      realThreatSignals.set(`${p}:${d1.cellIndex}`, { assaultK: isAss });
    }
  }
  for (const tk of tokens22) {
    if (tk.isPrivateDieSignalOnAlly) {
      const key = `${tk.targetPlayerIndex}:${tk.cellIndex}`;
      const prev = realThreatSignals.get(key)?.assaultK ?? 0;
      realThreatSignals.set(key, {
        assaultK: prev + tk.knownAssaultOnTarget,
      });
    }
  }

  for (let round = 2; round <= R_MAX; round++) {
    let changedInThisRound = false;

    for (let k = 0; k < N; k++) {
      const tk = tokens22[k];
      if (tk.profile !== 'COORD_HYBRID' && tk.profile !== 'COORD_NO_DICE') {
        continue;
      }

      const currentG = groups[tk.targetPlayerIndex];
      const currentCell = currentG.cells[tk.cellIndex - 1];
      const currentKey = `${tk.targetPlayerIndex}:${tk.cellIndex}`;

      // Évaluer si le jeton actuel de k est "verrouillé / indispensable" ou "réallouable" :
      let currentTokenUtility = 0;
      let mustMoveCurrentToken = false;

      if (tk.track === 'STEALTH') {
        if (currentCell.stealthDefenders > 2) {
          // Collision Furtivité (> 2 jetons sur la même case) -> DOIT bouger immédiatement !
          mustMoveCurrentToken = true;
          currentTokenUtility = -10;
        } else if (
          countStealthPairsOnBoard() > maxNewStealthTokensAllowed &&
          currentCell.stealthDefenders >= 2
        ) {
          // Dépassement de la réserve MaxN -> DOIT bouger !
          mustMoveCurrentToken = true;
          currentTokenUtility = -5;
        } else if (currentCell.stealthDefenders === 1) {
          // Jeton Furtivité encore orphelin (1/2) :
          // Aux rondes 2 et 3 on lui laisse une chance d'être rejoint, mais à la dernière ronde (round === R_MAX)
          // on l'interdit formellement de rester orphelin !
          if (round === R_MAX) {
            mustMoveCurrentToken = true;
            currentTokenUtility = -20;
          } else {
            currentTokenUtility = 1.2;
          }
        } else {
          // Paire Furtivité valide (2/2) dans la limite MaxN
          const priorA = priorsFull.byPlayerAndMachine.get(
            `${tk.targetPlayerIndex}:A`
          )!;
          const priorB = priorsFull.byPlayerAndMachine.get(
            `${tk.targetPlayerIndex}:B`
          )!;
          currentTokenUtility =
            3.2 +
            Math.max(
              priorA.expectedLossIfUnprotected,
              priorB.expectedLossIfUnprotected
            );
        }
      } else {
        // Track === 'TACTICAL'
        const mA = currentG.harvester;
        const mB = currentG.bulldozer;
        const passiveBonus =
          (currentCell.hasTrap ? 1 : 0) +
          (mA.status === 'NORMAL' &&
          mA.position !== null &&
          mA.position + 1 === tk.cellIndex &&
          mA.hasSabotage
            ? 1
            : 0) +
          (mB.status === 'NORMAL' &&
          mB.position !== null &&
          mB.position + 1 === tk.cellIndex &&
          mB.hasSabotage
            ? 1
            : 0);

        const totalS = currentCell.tacticalDefenders + passiveBonus;
        const sigInfo = realThreatSignals.get(currentKey);
        const knownAss = sigInfo?.assaultK ?? 0;
        const parryThreshold = 2 + knownAss + shift;
        const hsThreshold = computeEffectiveHsThreshold(
          config,
          knownAss,
          passiveBonus
        );

        if (currentCell.tacticalDefenders > cap || totalS > hsThreshold) {
          // Overkill Tactique ou dépassement de Cap -> DOIT être réalloué !
          mustMoveCurrentToken = true;
          currentTokenUtility = -8;
        } else if (sigInfo) {
          if (totalS === parryThreshold) {
            // Ce jeton permet tout juste d'assurer la Parade sur une vraie menace signalée ! Indispensable !
            currentTokenUtility = 12.0;
          } else if (totalS === hsThreshold) {
            // Ce jeton assure la Mise HS sur une vraie menace signalée !
            currentTokenUtility = 8.5;
          } else if (totalS < parryThreshold) {
            // Signal isolé S=1 : à garder aux rondes 2-3 pour qu'un allié vienne le compléter !
            currentTokenUtility = round < R_MAX ? 6.5 : 1.5;
          }
        } else {
          // Case non signalée par un dé privé (couverture probabiliste I2)
          const priorA = priorsFull.byPlayerAndMachine.get(
            `${tk.targetPlayerIndex}:A`
          )!;
          const priorB = priorsFull.byPlayerAndMachine.get(
            `${tk.targetPlayerIndex}:B`
          )!;
          const bestPrior =
            priorB.targetCellIfNormal === tk.cellIndex
              ? priorB
              : priorA.targetCellIfNormal === tk.cellIndex
              ? priorA
              : priorB.expectedLossIfUnprotected >
                priorA.expectedLossIfUnprotected
              ? priorB
              : priorA;
          currentTokenUtility =
            bestPrior.expectedLossIfUnprotected +
            (totalS === parryThreshold ? 1.5 : 0);
        }
      }

      // Si le jeton est déjà indispensable (ex. assure une Parade sur une vraie menace), on ne y touche pas
      if (!mustMoveCurrentToken && currentTokenUtility >= 8.0) {
        continue;
      }

      // Retirer temporairement le jeton de k pour évaluer la meilleure réponse (Best-Response) sur le plateau
      applyToken(tk, -1);

      let bestCandidate: {
        targetP: number;
        cellIdx: number;
        track: DefenderTrackType;
        utility: number;
        reason: string;
      } | null = null;

      const currentPairsCount = countStealthPairsOnBoard();

      for (let pIdx = 0; pIdx < N; pIdx++) {
        if (pIdx === k) continue;
        const g = groups[pIdx];

        // 1. Évaluer les options TACTICAL sur les machines de pIdx
        for (const mType of ['A', 'B'] as const) {
          const m = mType === 'A' ? g.harvester : g.bulldozer;
          if (m.status !== 'NORMAL' || m.position === null) continue;
          const cIdx = m.position + 1;
          const cell = g.cells[cIdx - 1];
          if (!cell || cell.tacticalDefenders >= cap) continue;

          const passiveBonus = getExistingPassiveBonusForNextCell(g, m);
          const sWithoutMe = cell.tacticalDefenders + passiveBonus;
          const sWithMe = sWithoutMe + 1;
          const key = `${pIdx}:${cIdx}`;
          const sigInfo = realThreatSignals.get(key);
          const knownAss = sigInfo?.assaultK ?? 0;
          const parryThreshold = 2 + knownAss + shift;
          const hsThreshold = computeEffectiveHsThreshold(
            config,
            knownAss,
            passiveBonus
          );
          const prior = priorsFull.byPlayerAndMachine.get(`${pIdx}:${mType}`)!;

          if (sWithMe > hsThreshold) continue; // Zéro Overkill Tactique !

          let u = prior.expectedLossIfUnprotected;
          let tag = 'Couverture I2';

          if (sigInfo) {
            if (sWithMe === parryThreshold) {
              // Secours critique : complète un Signal 2.1 ou un Signal 2.2 (Ronde 1) pour atteindre la Parade (voire Mise HS si Synergie Piège/Sabotage) !
              u += 11.0 + prior.cellVulnerability;
              tag =
                sWithMe >= hsThreshold
                  ? 'Complète Signal -> PARADE+HS (Synergie)'
                  : 'Secours Signal 2.1/2.2 -> PARADE';
            } else if (sWithMe === hsThreshold) {
              u += 7.5 + prior.cellVulnerability;
              tag = 'Complète Signal -> MISE HS';
            } else if (
              tk.isPrivateDieSignalOnAlly &&
              tk.targetPlayerIndex === pIdx &&
              tk.cellIndex === cIdx &&
              round < R_MAX
            ) {
              u += 6.0;
              tag = 'Maintien Signal 2.2';
            }
          } else {
            if (sWithMe === parryThreshold && cell.tacticalDefenders >= 1) {
              u += 2.2;
              tag = 'Binôme Tactique I2 -> Parade';
            } else if (sWithMe === hsThreshold && passiveBonus >= 1) {
              u += 2.8;
              tag = 'Synergie Piège/Sabotage -> Mise HS';
            }
          }

          if (!bestCandidate || u > bestCandidate.utility) {
            bestCandidate = {
              targetP: pIdx,
              cellIdx: cIdx,
              track: 'TACTICAL',
              utility: u,
              reason: `[${tk.profile === 'COORD_NO_DICE' ? '4.CoordSansDé' : '6.CoordRév'} 2.2 R${round}] ${tag} sur J${pIdx + 1} en c=${cIdx} (S=${sWithMe})`,
            };
          }
        }

        // 2. Évaluer la complétion d'un appel Furtivité orphelin (stealthDefenders === 1 -> 2)
        if (currentPairsCount < maxNewStealthTokensAllowed) {
          for (const cell of g.cells) {
            if (cell.stealthDefenders === 1) {
              const priorA = priorsFull.byPlayerAndMachine.get(`${pIdx}:A`)!;
              const priorB = priorsFull.byPlayerAndMachine.get(`${pIdx}:B`)!;
              const u =
                5.2 +
                Math.max(
                  priorA.expectedLossIfUnprotected,
                  priorB.expectedLossIfUnprotected
                );
              if (!bestCandidate || u > bestCandidate.utility) {
                bestCandidate = {
                  targetP: pIdx,
                  cellIdx: cell.cellIndex,
                  track: 'STEALTH',
                  utility: u,
                  reason: `[${tk.profile === 'COORD_NO_DICE' ? '4.CoordSansDé' : '6.CoordRév'} 2.2 R${round}] Complète Furtivité (2/2) sur J${pIdx + 1} en c=${cell.cellIndex}`,
                };
              }
            }
          }
        }
      }

      // Si aucune cible standard n'a été trouvée, fallback propre sans dépasser cap
      if (!bestCandidate) {
        const fallbackP = k === 0 ? 1 : 0;
        const fallbackCell = findValidTacticalCellOnTrack(
          groups[fallbackP],
          2,
          cap
        );
        bestCandidate = {
          targetP: fallbackP,
          cellIdx: fallbackCell,
          track: 'TACTICAL',
          utility: 0.1,
          reason: `[Coord 2.2 R${round}] Repli Tactique sans Overkill sur J${fallbackP + 1} en c=${fallbackCell}`,
        };
      }

      // Décider si on change de pose par rapport à la ronde précédente
      const isDifferentPlacement =
        bestCandidate.targetP !== tk.targetPlayerIndex ||
        bestCandidate.cellIdx !== tk.cellIndex ||
        bestCandidate.track !== tk.track;

      if (
        isDifferentPlacement &&
        (mustMoveCurrentToken ||
          bestCandidate.utility > currentTokenUtility + 0.35)
      ) {
        tk.targetPlayerIndex = bestCandidate.targetP;
        tk.cellIndex = bestCandidate.cellIdx;
        tk.track = bestCandidate.track;
        tk.reason = bestCandidate.reason;
        tk.revisionsRound = round;
        step2RevisionsCount += 1;
        changedInThisRound = true;
      }

      // Réappliquer le jeton (modifié ou conservé) sur le plateau
      applyToken(tk, 1);
    }

    if (!changedInThisRound && round < R_MAX - 1) {
      // Si convergence atteinte et aucun jeton Furtivité orphelin en attente de la ronde finale, on peut passer à la vérification finale
      const anyOrphanStealth = groups.some((g) =>
        g.cells.some((c) => c.stealthDefenders === 1)
      );
      if (!anyOrphanStealth) break;
    }
  }

  // Passe finale de sécurité sur les jetons 2.2 des bots révisables :
  // Si un bot révisable a encore son 2e jeton en STEALTH seul (stealthDefenders === 1), il le reconvertit immédiatement en TACTICAL !
  for (let k = 0; k < N; k++) {
    const tk = tokens22[k];
    if (tk.profile !== 'COORD_HYBRID' && tk.profile !== 'COORD_NO_DICE') {
      continue;
    }
    const cell = groups[tk.targetPlayerIndex].cells[tk.cellIndex - 1];
    if (tk.track === 'STEALTH' && cell && cell.stealthDefenders === 1) {
      applyToken(tk, -1);
      const bestThreat = priorsFull.sortedThreats.find(
        (t) =>
          t.playerIndex !== k &&
          groups[t.playerIndex].cells[t.targetCellIfNormal - 1]
            .tacticalDefenders < cap
      );
      const newP = bestThreat ? bestThreat.playerIndex : k === 0 ? 1 : 0;
      const newC = bestThreat
        ? bestThreat.targetCellIfNormal
        : findValidTacticalCellOnTrack(groups[newP], 2, cap);
      tk.targetPlayerIndex = newP;
      tk.cellIndex = newC;
      tk.track = 'TACTICAL';
      tk.reason = `[${tk.profile === 'COORD_NO_DICE' ? '4.CoordSansDé' : '6.CoordRév'} 2.2 R4] Reconversion Furtivité Orpheline (1/2) -> Renfort Tactique sur J${newP + 1} en c=${newC}`;
      tk.revisionsRound = R_MAX;
      step2RevisionsCount += 1;
      applyToken(tk, 1);
    }
  }

  const finalDecisions: DefenderPlacementDecision[] = tokens22.map((tk) => ({
    playerIndex: tk.playerIndex,
    step: 2,
    targetPlayerIndex: tk.targetPlayerIndex,
    cellIndex: tk.cellIndex,
    track: tk.track,
    reason: tk.reason,
    revisionsRound: tk.revisionsRound,
  }));

  return {
    step2Decisions: finalDecisions,
    step2RevisionsCount,
    signaledCellsCount,
  };
}

/**
 * 7. BOT OMNISCIENT (Table ouverte / Plafond théorique v3.3)
 * Connaît la totalité des N tirages (T_1..T_N) à l'avance et alloue ses 2N Défenseurs
 * de manière globalement optimale en tenant compte de parryHsRule ('SYNERGY_TRAP_SAB' vs 'STANDARD_S3').
 */
function executeOmniscientTeamPhase2(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[]
): DefenderPlacementDecision[] {
  const N = config.numPlayers;
  const cap = config.tacticalDefenderCap;
  const shift = config.combatThresholdShift;
  const decisions: DefenderPlacementDecision[] = [];

  const existingStealthTokens = countActiveStealthTokensOnBoard(groups);
  const maxNewStealthTokensAllowed = Math.max(0, N - existingStealthTokens);

  interface PlannedCombatTarget {
    playerIndex: number;
    cellIndex: number;
    cards: TacticType[];
    assaultK: number;
    passiveBonus: number;
    dangerScore: number;
    assignedTacticalDefenders: number;
    desiredTacticalDefenders: number;
  }

  const drawsByMachine = new Map<string, TacticType[]>();
  for (const d of draws) {
    const mType = d.tactic.startsWith('A') ? 'A' : 'B';
    const key = `${d.targetPlayerIndex}:${mType}`;
    const arr = drawsByMachine.get(key) || [];
    arr.push(d.tactic);
    drawsByMachine.set(key, arr);
  }

  const combatMap = new Map<string, PlannedCombatTarget>();

  for (const [mKey, cards] of drawsByMachine.entries()) {
    const [pStr, mType] = mKey.split(':');
    const pIdx = Number(pStr);
    const g = groups[pIdx];
    const m = mType === 'A' ? g.harvester : g.bulldozer;

    if (m.status === 'DESTROYED' || m.position === null) continue;

    let activeCombatCards: TacticType[] = [];
    let sabClearedOnActiveRepair = false;

    if (m.status === 'NORMAL') {
      activeCombatCards = cards;
    } else if (m.status === 'HS' && cards.length >= 2) {
      activeCombatCards = cards.slice(1);
      sabClearedOnActiveRepair = true;
    }

    if (activeCombatCards.length === 0) continue;

    const cIdx = m.position + 1;
    const key = `${pIdx}:${cIdx}`;
    let entry = combatMap.get(key);
    if (!entry) {
      const cell = g.cells[cIdx - 1];
      const trapBonus = cell?.hasTrap ? 1 : 0;
      entry = {
        playerIndex: pIdx,
        cellIndex: cIdx,
        cards: [],
        assaultK: 0,
        passiveBonus: trapBonus,
        dangerScore: 0,
        assignedTacticalDefenders: 0,
        desiredTacticalDefenders: 0,
      };
      combatMap.set(key, entry);
    }
    entry.cards.push(...activeCombatCards);
    if (m.hasSabotage && !sabClearedOnActiveRepair) {
      entry.passiveBonus += 1;
    }
  }

  for (const entry of combatMap.values()) {
    entry.assaultK = entry.cards.filter((c) => c === 'A3' || c === 'B3').length;

    const hasExplosionA =
      entry.cards.includes('A2') && entry.cards.includes('A3');
    const hasExplosionB =
      entry.cards.includes('B2') && entry.cards.includes('B3');
    const overheatCount = entry.cards.filter(
      (c) => c === 'A2' || c === 'B2'
    ).length;

    const g = groups[entry.playerIndex];
    const cell = g.cells[entry.cellIndex - 1];
    const hasB = entry.cards.some((c) => c.startsWith('B'));
    const stumpDanger =
      hasB && cell
        ? cell.stumps >= 1
          ? cell.stumps * 22
          : config.bulldozerZeroStumpAction === 'DESTROY_TREE' &&
            cell.standingTrees >= 1
          ? 20
          : 0
        : 0;

    entry.dangerScore =
      (hasExplosionA || hasExplosionB ? 100 : 0) +
      overheatCount * 28 +
      stumpDanger +
      entry.cards.length * 16 -
      entry.assaultK * 4;

    const effectiveHsS = computeEffectiveHsThreshold(
      config,
      entry.assaultK,
      entry.passiveBonus
    );
    const neededForHS = Math.max(0, effectiveHsS - entry.passiveBonus);
    const neededForParry = Math.max(
      0,
      2 + entry.assaultK + shift - entry.passiveBonus
    );

    if (neededForHS <= cap && neededForHS <= 3) {
      entry.desiredTacticalDefenders = neededForHS;
    } else if (neededForParry <= cap) {
      entry.desiredTacticalDefenders = neededForParry;
    } else {
      entry.desiredTacticalDefenders = 0;
    }
  }

  const sortedTargets = Array.from(combatMap.values()).sort(
    (a, b) => b.dangerScore - a.dangerScore
  );

  const step1Used = new Array(N).fill(false);
  const step1Decisions: DefenderPlacementDecision[] = [];

  for (let k = 0; k < N; k++) {
    const ownTarget = sortedTargets.find(
      (t) =>
        t.playerIndex === k &&
        t.assignedTacticalDefenders < t.desiredTacticalDefenders &&
        groups[k].cells[t.cellIndex - 1].tacticalDefenders < cap
    );
    if (ownTarget) {
      ownTarget.assignedTacticalDefenders += 1;
      step1Used[k] = true;
      groups[k].cells[ownTarget.cellIndex - 1].tacticalDefenders += 1;
      step1Decisions.push({
        playerIndex: k,
        step: 1,
        targetPlayerIndex: k,
        cellIndex: ownTarget.cellIndex,
        track: 'TACTICAL',
        reason: `[7.Omniscient 2.1] Défense Tactique exacte sur case attaquée c=${ownTarget.cellIndex}`,
        revisionsRound: 1,
      });
    }
  }

  const openStealthCells: Array<{ playerIndex: number; cellIndex: number }> = [];
  for (let k = 0; k < N; k++) {
    if (step1Used[k]) continue;
    const g = groups[k];

    if (openStealthCells.length < maxNewStealthTokensAllowed) {
      let targetCell = (g.harvester.position || g.bulldozer.position || 1) + 1;
      if (g.cells[targetCell - 1]?.hasTrap) {
        targetCell += 1;
      }
      const safeCell = Math.max(1, Math.min(g.cells.length - 1, targetCell));
      g.cells[safeCell - 1].stealthDefenders += 1;
      openStealthCells.push({ playerIndex: k, cellIndex: safeCell });
      step1Decisions.push({
        playerIndex: k,
        step: 1,
        targetPlayerIndex: k,
        cellIndex: safeCell,
        track: 'STEALTH',
        reason: `[7.Omniscient 2.1] Ouverture paire Furtivité (1/2) en c=${safeCell}`,
        revisionsRound: 1,
      });
    } else {
      const prefPos = (g.harvester.position || g.bulldozer.position || 1) + 1;
      const fallbackCell = findValidTacticalCellOnTrack(g, prefPos, cap);
      g.cells[fallbackCell - 1].tacticalDefenders += 1;
      step1Decisions.push({
        playerIndex: k,
        step: 1,
        targetPlayerIndex: k,
        cellIndex: fallbackCell,
        track: 'TACTICAL',
        reason: `[7.Omniscient 2.1] Garde Tactique en c=${fallbackCell} (Réserve MaxN atteinte)`,
        revisionsRound: 1,
      });
    }
  }

  decisions.push(...step1Decisions);

  // Étape 2.2 Omnisciente
  for (let k = 0; k < N; k++) {
    const allyCombat = sortedTargets.find(
      (t) =>
        t.playerIndex !== k &&
        t.assignedTacticalDefenders < t.desiredTacticalDefenders &&
        groups[t.playerIndex].cells[t.cellIndex - 1].tacticalDefenders < cap
    );
    if (allyCombat) {
      allyCombat.assignedTacticalDefenders += 1;
      groups[allyCombat.playerIndex].cells[
        allyCombat.cellIndex - 1
      ].tacticalDefenders += 1;
      decisions.push({
        playerIndex: k,
        step: 2,
        targetPlayerIndex: allyCombat.playerIndex,
        cellIndex: allyCombat.cellIndex,
        track: 'TACTICAL',
        reason: `[7.Omniscient 2.2] Soutien Tactique exact sur J${allyCombat.playerIndex + 1} en c=${allyCombat.cellIndex}`,
        revisionsRound: 1,
      });
      continue;
    }

    const stealthIdx = openStealthCells.findIndex((s) => s.playerIndex !== k);
    if (stealthIdx !== -1) {
      const st = openStealthCells.splice(stealthIdx, 1)[0];
      groups[st.playerIndex].cells[st.cellIndex - 1].stealthDefenders += 1;
      decisions.push({
        playerIndex: k,
        step: 2,
        targetPlayerIndex: st.playerIndex,
        cellIndex: st.cellIndex,
        track: 'STEALTH',
        reason: `[7.Omniscient 2.2] Fermeture paire Furtivité (2/2) sur J${st.playerIndex + 1} en c=${st.cellIndex}`,
        revisionsRound: 1,
      });
      continue;
    }

    const anyAllyCombat = sortedTargets.find(
      (t) =>
        t.playerIndex !== k &&
        groups[t.playerIndex].cells[t.cellIndex - 1].tacticalDefenders < cap
    );
    const fallbackP = anyAllyCombat
      ? anyAllyCombat.playerIndex
      : k === 0
      ? 1
      : 0;
    const fallbackCell = anyAllyCombat
      ? anyAllyCombat.cellIndex
      : findValidTacticalCellOnTrack(groups[fallbackP], 2, cap);
    groups[fallbackP].cells[fallbackCell - 1].tacticalDefenders += 1;
    decisions.push({
      playerIndex: k,
      step: 2,
      targetPlayerIndex: fallbackP,
      cellIndex: fallbackCell,
      track: 'TACTICAL',
      reason: `[7.Omniscient 2.2] Renfort Tactique sur J${fallbackP + 1} en c=${fallbackCell}`,
      revisionsRound: 1,
    });
  }

  // Sécurité Zéro Furtivité Orpheline pour Omniscient :
  // Si un openStealthCells n'a pas pu être fermé (ex. il ne restait que son propre propriétaire k), on le reconvertit en Tactique
  for (const rem of openStealthCells) {
    const cell = groups[rem.playerIndex].cells[rem.cellIndex - 1];
    if (cell && cell.stealthDefenders === 1) {
      cell.stealthDefenders = 0;
      const validC = findValidTacticalCellOnTrack(
        groups[rem.playerIndex],
        rem.cellIndex,
        cap
      );
      groups[rem.playerIndex].cells[validC - 1].tacticalDefenders += 1;
      const d1 = decisions.find(
        (d) => d.step === 1 && d.playerIndex === rem.playerIndex
      );
      if (d1) {
        d1.track = 'TACTICAL';
        d1.cellIndex = validC;
        d1.reason = `[7.Omniscient 2.1] Garde Tactique directe en c=${validC}`;
      }
    }
  }

  return decisions;
}
