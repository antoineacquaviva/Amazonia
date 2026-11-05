import {
  BotProfileId,
  DefenderPlacementDecision,
  MachineState,
  PlayerForestGroup,
  SecretVillainDraw,
  SimulationConfig,
  TacticType,
} from './types';
import { SeededRNG } from './rng';

function getTargetMachineForTactic(
  group: PlayerForestGroup,
  tactic: TacticType
): MachineState {
  return tactic.startsWith('A') ? group.harvester : group.bulldozer;
}

function getActiveMachines(group: PlayerForestGroup): MachineState[] {
  const list: MachineState[] = [];
  if (group.harvester.status !== 'DESTROYED' && group.harvester.position !== null) {
    list.push(group.harvester);
  }
  if (group.bulldozer.status !== 'DESTROYED' && group.bulldozer.position !== null) {
    list.push(group.bulldozer);
  }
  return list;
}

/**
 * Calcule le bonus passif déjà présent sur une case c (Piège + Sabotage de la machine qui va y entrer)
 */
function getExistingPassiveBonusForNextCell(
  group: PlayerForestGroup,
  machine: MachineState
): number {
  if (machine.status !== 'NORMAL' || machine.position === null) return 0;
  const targetCellIdx = machine.position + 1;
  const cell = group.cells[targetCellIdx - 1];
  let bonus = cell?.hasTrap ? 1 : 0;
  if (machine.hasSabotage) bonus += 1;
  return bonus;
}

/**
 * Exécute la Phase 2 (Étape 2.1 + Étape 2.2) pour les N joueurs selon leurs profils de Bots
 */
export function executePhase2Bots(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[],
  botProfiles: BotProfileId[],
  rng: SeededRNG
): DefenderPlacementDecision[] {
  const N = config.numPlayers;
  const decisions: DefenderPlacementDecision[] = [];

  // Si toute la table est OMNISCIENT, on utilise le planificateur global Omniscient
  if (botProfiles.every((b) => b === 'OMNISCIENT')) {
    return executeOmniscientTeamPhase2(config, groups, draws);
  }

  // ==========================================================================
  // ÉTAPE 2.1 : Défense principale (chaque joueur k pose 1 jeton sur sa piste k)
  // ==========================================================================
  for (let k = 0; k < N; k++) {
    const profile = botProfiles[k % botProfiles.length];
    const ownGroup = groups[k];
    const ownDraw = draws[k];

    let chosenCell = 1;
    let chosenTrack: 'TACTICAL' | 'STEALTH' = 'TACTICAL';
    let reason = '';

    if (profile === 'RANDOM') {
      const active = getActiveMachines(ownGroup);
      if (active.length > 0) {
        const m = active[rng.nextInt(0, active.length - 1)];
        const basePos = m.position || 1;
        chosenCell = rng.nextFloat() < 0.5 ? basePos : basePos + 1;
      } else {
        chosenCell = rng.nextInt(1, 2);
      }
      chosenTrack = rng.nextFloat() < 0.5 ? 'TACTICAL' : 'STEALTH';
      reason = 'Placement aléatoire (p ou p+1, Tactique ou Furtivité)';
    } else if (profile === 'COMBAT_PURE') {
      // Bot « Combat Pur » (Réactif)
      const drawnMachine = getTargetMachineForTactic(ownGroup, ownDraw.tactic);
      if (
        ownDraw.targetPlayerIndex === k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        chosenCell = drawnMachine.position + 1;
        chosenTrack = 'TACTICAL';
        reason = `Tirage personnel (${ownDraw.tactic}) ciblant sa propre machine ${drawnMachine.type} NORMAL en c=${drawnMachine.position} -> Défense Tactique en c=${chosenCell}`;
      } else if (
        ownGroup.harvester.status === 'NORMAL' &&
        ownGroup.harvester.position !== null
      ) {
        chosenCell = ownGroup.harvester.position + 1;
        chosenTrack = 'TACTICAL';
        reason = `Couverture réactive par défaut de son Abatteuse NORMAL en c=${chosenCell}`;
      } else if (
        ownGroup.bulldozer.status === 'NORMAL' &&
        ownGroup.bulldozer.position !== null
      ) {
        chosenCell = ownGroup.bulldozer.position + 1;
        chosenTrack = 'TACTICAL';
        reason = `Couverture réactive de son Bulldozer NORMAL en c=${chosenCell}`;
      } else {
        chosenCell =
          ownGroup.harvester.position || ownGroup.bulldozer.position || 1;
        chosenTrack = 'TACTICAL';
        reason = 'Machines immobilisées/détruites -> Garde Tactique de repli';
      }
    } else {
      // HYBRID_STEALTH_COMBAT (ou OMNISCIENT individuel dans une table mixte)
      const drawnMachine = getTargetMachineForTactic(ownGroup, ownDraw.tactic);
      const selfTargetedNormal =
        ownDraw.targetPlayerIndex === k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null;

      if (selfTargetedNormal && drawnMachine.position !== null) {
        chosenCell = drawnMachine.position + 1;
        chosenTrack = 'TACTICAL';
        reason = `Menace personnelle directe (${ownDraw.tactic}) sur machine ${drawnMachine.type} -> Piste Tactique en c=${chosenCell}`;
      } else {
        // Vérifier si une machine NORMAL a déjà un Piège en p+1 ou un Sabotage (opportunité de Parade/Mise HS facile)
        const harv = ownGroup.harvester;
        const bull = ownGroup.bulldozer;
        const harvBonus = getExistingPassiveBonusForNextCell(ownGroup, harv);
        const bullBonus = getExistingPassiveBonusForNextCell(ownGroup, bull);

        if (harv.status === 'NORMAL' && harv.position !== null && harvBonus >= 1) {
          chosenCell = harv.position + 1;
          chosenTrack = 'TACTICAL';
          reason = `Exploitation Piège/Sabotage existant (bonus +${harvBonus}) devant l'Abatteuse en c=${chosenCell}`;
        } else if (
          bull.status === 'NORMAL' &&
          bull.position !== null &&
          bullBonus >= 1
        ) {
          chosenCell = bull.position + 1;
          chosenTrack = 'TACTICAL';
          reason = `Exploitation Piège/Sabotage existant (bonus +${bullBonus}) devant le Bulldozer en c=${chosenCell}`;
        } else if (
          k === 0 &&
          harv.status === 'NORMAL' &&
          harv.position !== null
        ) {
          // J1 est très exposé sur la Matrice 2D6 : protège son Abatteuse en Tactique
          chosenCell = harv.position + 1;
          chosenTrack = 'TACTICAL';
          reason = `Joueur J1 très exposé -> Couverture Tactique prioritaire en c=${chosenCell}`;
        } else if (
          harv.status === 'HS' &&
          harv.position !== null &&
          !harv.hasSabotage
        ) {
          // Machine HS sur place : excellente cible pour poser un Sabotage en Furtivité
          chosenCell = harv.position;
          chosenTrack = 'STEALTH';
          reason = `Initiative Furtivité (1/2) sur Abatteuse HS en c=${chosenCell} pour préparer un Sabotage`;
        } else if (
          bull.status === 'HS' &&
          bull.position !== null &&
          !bull.hasSabotage
        ) {
          chosenCell = bull.position;
          chosenTrack = 'STEALTH';
          reason = `Initiative Furtivité (1/2) sur Bulldozer HS en c=${chosenCell} pour préparer un Sabotage`;
        } else if (
          harv.status === 'NORMAL' &&
          harv.position !== null &&
          !ownGroup.cells[harv.position]?.hasTrap
        ) {
          // Prépare un Piège ou Sabotage en p+1 via la Piste Furtivité
          chosenCell = harv.position + 1;
          chosenTrack = 'STEALTH';
          reason = `Initiative Furtivité (1/2) en c=${chosenCell} (devant Abatteuse) pour poser Piège ou Sabotage`;
        } else if (harv.status === 'NORMAL' && harv.position !== null) {
          chosenCell = harv.position + 1;
          chosenTrack = 'TACTICAL';
          reason = `Défense Tactique en c=${chosenCell}`;
        } else if (bull.status === 'NORMAL' && bull.position !== null) {
          chosenCell = bull.position + 1;
          chosenTrack = 'TACTICAL';
          reason = `Défense Tactique en c=${chosenCell}`;
        } else {
          chosenCell = 2;
          chosenTrack = 'STEALTH';
          reason = 'Préparation de Piège Furtivité en c=2';
        }
      }
    }

    const safeCell = Math.max(1, Math.min(ownGroup.cells.length - 1, chosenCell));
    if (chosenTrack === 'TACTICAL') {
      ownGroup.cells[safeCell - 1].tacticalDefenders += 1;
    } else {
      ownGroup.cells[safeCell - 1].stealthDefenders += 1;
    }

    decisions.push({
      playerIndex: k,
      step: 1,
      targetPlayerIndex: k,
      cellIndex: safeCell,
      track: chosenTrack,
      reason,
    });
  }

  // ==========================================================================
  // ÉTAPE 2.2 : Soutien et coordination (chaque joueur k pose 1 jeton sur P != k)
  // ==========================================================================
  for (let k = 0; k < N; k++) {
    const profile = botProfiles[k % botProfiles.length];
    const ownDraw = draws[k];

    let targetP = k === 0 ? 1 : 0;
    let chosenCell = 1;
    let chosenTrack: 'TACTICAL' | 'STEALTH' = 'TACTICAL';
    let reason = '';

    if (profile === 'RANDOM') {
      const otherPlayers = Array.from({ length: N }, (_, idx) => idx).filter(
        (idx) => idx !== k
      );
      targetP = otherPlayers[rng.nextInt(0, otherPlayers.length - 1)];
      const allyGroup = groups[targetP];
      const active = getActiveMachines(allyGroup);
      if (active.length > 0) {
        const m = active[rng.nextInt(0, active.length - 1)];
        const basePos = m.position || 1;
        chosenCell = rng.nextFloat() < 0.5 ? basePos : basePos + 1;
      } else {
        chosenCell = rng.nextInt(1, 2);
      }
      chosenTrack = rng.nextFloat() < 0.5 ? 'TACTICAL' : 'STEALTH';
      reason = `Soutien aléatoire sur J${targetP + 1}`;
    } else if (profile === 'COMBAT_PURE') {
      const drawnTargetP = ownDraw.targetPlayerIndex;
      const drawnGroup = groups[drawnTargetP];
      const drawnMachine = getTargetMachineForTactic(drawnGroup, ownDraw.tactic);

      if (
        drawnTargetP !== k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        targetP = drawnTargetP;
        chosenCell = drawnMachine.position + 1;
        chosenTrack = 'TACTICAL';
        reason = `Alerte tirage (${ownDraw.tactic} -> J${targetP + 1}) : soutien Tactique en c=${chosenCell}`;
      } else {
        // Chercher un allié (priorité J1) où un jeton Tactique permet d'atteindre S=2 ou S=3 sur p+1 d'une machine NORMAL
        let foundBest = false;
        for (let pIdx = 0; pIdx < N; pIdx++) {
          if (pIdx === k) continue;
          const g = groups[pIdx];
          for (const m of [g.harvester, g.bulldozer]) {
            if (m.status === 'NORMAL' && m.position !== null) {
              const cIdx = m.position + 1;
              const cell = g.cells[cIdx - 1];
              const currentS =
                (cell?.tacticalDefenders || 0) +
                getExistingPassiveBonusForNextCell(g, m);
              if (currentS >= 1 && currentS <= 2) {
                targetP = pIdx;
                chosenCell = cIdx;
                chosenTrack = 'TACTICAL';
                reason = `Soutien Tactique sur J${targetP + 1} en c=${chosenCell} pour atteindre S=${currentS + 1} (Parade / Mise HS)`;
                foundBest = true;
                break;
              }
            }
          }
          if (foundBest) break;
        }

        if (!foundBest) {
          targetP = k === 0 ? 1 : 0;
          const fallbackGroup = groups[targetP];
          const m =
            fallbackGroup.harvester.status === 'NORMAL'
              ? fallbackGroup.harvester
              : fallbackGroup.bulldozer;
          chosenCell = (m.position || 1) + 1;
          chosenTrack = 'TACTICAL';
          reason = `Soutien Tactique par défaut sur J${targetP + 1} en c=${chosenCell}`;
        }
      }
    } else {
      // HYBRID_STEALTH_COMBAT
      const drawnTargetP = ownDraw.targetPlayerIndex;
      const drawnGroup = groups[drawnTargetP];
      const drawnMachine = getTargetMachineForTactic(drawnGroup, ownDraw.tactic);

      // 1. Si son propre dé attaque un allié (P_k != k) sur une machine NORMAL :
      //    On vérifie s'il vaut mieux renforcer la Piste Tactique en p+1
      if (
        drawnTargetP !== k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        const cIdx = drawnMachine.position + 1;
        const cell = drawnGroup.cells[cIdx - 1];
        const currentS =
          (cell?.tacticalDefenders || 0) +
          getExistingPassiveBonusForNextCell(drawnGroup, drawnMachine);
        const isAssault =
          ownDraw.tactic === 'A3' || ownDraw.tactic === 'B3' ? 1 : 0;

        // Si on peut atteindre au moins la Parade (S >= 2 + isAssault) ou s'il y a déjà un défenseur
        if (currentS + 1 >= 2 + isAssault || currentS >= 1) {
          targetP = drawnTargetP;
          chosenCell = cIdx;
          chosenTrack = 'TACTICAL';
          reason = `Alerte tirage (${ownDraw.tactic} -> J${targetP + 1}) : complète la défense Tactique en c=${chosenCell} (S estimé=${currentS + 1})`;
        } else if (cell && cell.stealthDefenders === 1) {
          // Si l'allié avait ouvert une paire de Furtivité sur cette même case p+1, compléter la Furtivité pose un Sabotage !
          targetP = drawnTargetP;
          chosenCell = cIdx;
          chosenTrack = 'STEALTH';
          reason = `Complète la paire Furtivité (2/2) en c=${chosenCell} chez J${targetP + 1} pour saboter la machine entrante`;
        } else {
          targetP = drawnTargetP;
          chosenCell = cIdx;
          chosenTrack = 'TACTICAL';
          reason = `Alerte tirage (${ownDraw.tactic} -> J${targetP + 1}) : pose un Défenseur Tactique en c=${chosenCell}`;
        }
      } else {
        // 2. Sinon, chercher en priorité une paire de Furtivité ouverte (stealthDefenders === 1) chez un allié
        let completedStealthPair = false;
        for (let pIdx = 0; pIdx < N; pIdx++) {
          if (pIdx === k) continue;
          const g = groups[pIdx];
          for (const cell of g.cells) {
            if (cell.stealthDefenders === 1) {
              targetP = pIdx;
              chosenCell = cell.cellIndex;
              chosenTrack = 'STEALTH';
              reason = `Coordination Furtivité (2/2) chez J${targetP + 1} en c=${chosenCell} -> Sabotage ou Piège garanti`;
              completedStealthPair = true;
              break;
            }
          }
          if (completedStealthPair) break;
        }

        // 3. À défaut de paire Furtivité ouverte, chercher une case Tactique alliée avec S=1 ou S=2 pour passer un palier (S=2 Parade ou S=3 Mise HS)
        if (!completedStealthPair) {
          let foundTacticalSynergy = false;
          for (let pIdx = 0; pIdx < N; pIdx++) {
            if (pIdx === k) continue;
            const g = groups[pIdx];
            for (const m of [g.harvester, g.bulldozer]) {
              if (m.status === 'NORMAL' && m.position !== null) {
                const cIdx = m.position + 1;
                const cell = g.cells[cIdx - 1];
                const currentS =
                  (cell?.tacticalDefenders || 0) +
                  getExistingPassiveBonusForNextCell(g, m);
                if (currentS >= 1 && currentS <= 2) {
                  targetP = pIdx;
                  chosenCell = cIdx;
                  chosenTrack = 'TACTICAL';
                  reason = `Synergie Tactique chez J${targetP + 1} en c=${chosenCell} pour atteindre S=${currentS + 1}`;
                  foundTacticalSynergy = true;
                  break;
                }
              }
            }
            if (foundTacticalSynergy) break;
          }

          if (!foundTacticalSynergy) {
            targetP = k === 0 ? 1 : 0;
            const g = groups[targetP];
            const m =
              g.harvester.status === 'NORMAL' ? g.harvester : g.bulldozer;
            chosenCell = (m.position || 1) + 1;
            chosenTrack = 'TACTICAL';
            reason = `Soutien Tactique préventif sur J${targetP + 1} en c=${chosenCell}`;
          }
        }
      }
    }

    const allyGroup = groups[targetP];
    const safeCell = Math.max(
      1,
      Math.min(allyGroup.cells.length - 1, chosenCell)
    );
    if (chosenTrack === 'TACTICAL') {
      allyGroup.cells[safeCell - 1].tacticalDefenders += 1;
    } else {
      allyGroup.cells[safeCell - 1].stealthDefenders += 1;
    }

    decisions.push({
      playerIndex: k,
      step: 2,
      targetPlayerIndex: targetP,
      cellIndex: safeCell,
      track: chosenTrack,
      reason,
    });
  }

  return decisions;
}

/**
 * Planificateur coopératif Omniscient (Borne Haute Théorique) :
 * Connaît tous les tirages (T_k, P_k) du tour et alloue les jetons Étape 2.1 (sur P=k) et Étape 2.2 (sur P!=k)
 * pour maximiser les Mises HS (S = 3 + k_assault) et Parades (S = 2 + k_assault), puis utilise les paires restantes en Furtivité.
 */
function executeOmniscientTeamPhase2(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[]
): DefenderPlacementDecision[] {
  const N = config.numPlayers;
  const decisions: DefenderPlacementDecision[] = [];

  // Simuler quelles cases vont recevoir des cartes faceUp à l'Étape 3.1
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

  const combatMap = new Map<string, PlannedCombatTarget>();

  for (const d of draws) {
    const g = groups[d.targetPlayerIndex];
    const m = getTargetMachineForTactic(g, d.tactic);
    if (m.status === 'NORMAL' && m.position !== null) {
      const cIdx = m.position + 1;
      const key = `${d.targetPlayerIndex}:${cIdx}`;
      let entry = combatMap.get(key);
      if (!entry) {
        const cell = g.cells[cIdx - 1];
        const trapBonus = cell?.hasTrap ? 1 : 0;
        entry = {
          playerIndex: d.targetPlayerIndex,
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
      entry.cards.push(d.tactic);
    }
  }

  for (const entry of combatMap.values()) {
    const g = groups[entry.playerIndex];
    const hasA = entry.cards.some((c) => c.startsWith('A'));
    const hasB = entry.cards.some((c) => c.startsWith('B'));
    let sabBonus = 0;
    if (hasA && g.harvester.hasSabotage) sabBonus += 1;
    if (hasB && g.bulldozer.hasSabotage) sabBonus += 1;
    entry.passiveBonus += sabBonus;
    entry.assaultK = entry.cards.filter((c) => c === 'A3' || c === 'B3').length;

    const hasExplosionA =
      entry.cards.includes('A2') && entry.cards.includes('A3');
    const hasExplosionB =
      entry.cards.includes('B2') && entry.cards.includes('B3');
    const overheatCount = entry.cards.filter(
      (c) => c === 'A2' || c === 'B2'
    ).length;

    entry.dangerScore =
      (hasExplosionA || hasExplosionB ? 100 : 0) +
      overheatCount * 25 +
      entry.cards.length * 15 -
      entry.assaultK * 4;

    // On vise prioritairement la Mise HS (S = 3 + k_assault), sinon la Parade (S = 2 + k_assault)
    const neededForHS = Math.max(
      0,
      3 + entry.assaultK - entry.passiveBonus
    );
    const neededForParry = Math.max(
      0,
      2 + entry.assaultK - entry.passiveBonus
    );
    entry.desiredTacticalDefenders =
      neededForHS <= 3 ? neededForHS : neededForParry;
  }

  const sortedTargets = Array.from(combatMap.values()).sort(
    (a, b) => b.dangerScore - a.dangerScore
  );

  const step1Used = new Array(N).fill(false);
  const step1Decisions: DefenderPlacementDecision[] = [];

  // Étape 2.1 : Chaque joueur k aide d'abord une case attaquée sur sa propre piste k
  for (let k = 0; k < N; k++) {
    const ownTarget = sortedTargets.find(
      (t) =>
        t.playerIndex === k &&
        t.assignedTacticalDefenders < t.desiredTacticalDefenders
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
        reason: `[Omniscient] Défense Tactique exacte sur case attaquée c=${ownTarget.cellIndex}`,
      });
    }
  }

  // Pour les joueurs k qui n'ont pas d'attaque urgente sur leur propre piste à l'Étape 2.1 :
  // Ils ouvrent une paire de Furtivité sur leur propre piste (qui sera complétée à l'Étape 2.2)
  const openStealthCells: Array<{ playerIndex: number; cellIndex: number }> = [];
  for (let k = 0; k < N; k++) {
    if (step1Used[k]) continue;
    const g = groups[k];
    let targetCell = 2;
    if (
      g.harvester.status === 'HS' &&
      g.harvester.position !== null &&
      !g.harvester.hasSabotage
    ) {
      targetCell = g.harvester.position;
    } else if (g.harvester.status === 'NORMAL' && g.harvester.position !== null) {
      targetCell = g.harvester.position + 1;
    } else if (g.bulldozer.status === 'NORMAL' && g.bulldozer.position !== null) {
      targetCell = g.bulldozer.position + 1;
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
      reason: `[Omniscient] Ouverture paire Furtivité (1/2) en c=${safeCell}`,
    });
  }

  decisions.push(...step1Decisions);

  // Étape 2.2 : Chaque joueur k pose son 2e jeton sur une piste P != k
  for (let k = 0; k < N; k++) {
    // 1. Compléter les seuils Tactiques des cibles attaquées chez P != k
    const allyCombat = sortedTargets.find(
      (t) =>
        t.playerIndex !== k &&
        t.assignedTacticalDefenders < t.desiredTacticalDefenders
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
        reason: `[Omniscient] Soutien Tactique exact sur J${allyCombat.playerIndex + 1} en c=${allyCombat.cellIndex}`,
      });
      continue;
    }

    // 2. Compléter une paire de Furtivité ouverte à l'Étape 2.1 chez P != k
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
        reason: `[Omniscient] Fermeture paire Furtivité (2/2) sur J${st.playerIndex + 1} en c=${st.cellIndex}`,
      });
      continue;
    }

    // 3. Repli : ajouter un défenseur Tactique sur une cible attaquée d'un allié pour viser S >= 3 + k_assault
    const anyAllyCombat = sortedTargets.find((t) => t.playerIndex !== k);
    const fallbackP = anyAllyCombat
      ? anyAllyCombat.playerIndex
      : k === 0
      ? 1
      : 0;
    const fallbackCell = anyAllyCombat ? anyAllyCombat.cellIndex : 2;
    groups[fallbackP].cells[fallbackCell - 1].tacticalDefenders += 1;
    decisions.push({
      playerIndex: k,
      step: 2,
      targetPlayerIndex: fallbackP,
      cellIndex: fallbackCell,
      track: 'TACTICAL',
      reason: `[Omniscient] Renfort Tactique sur J${fallbackP + 1} en c=${fallbackCell}`,
    });
  }

  return decisions;
}
