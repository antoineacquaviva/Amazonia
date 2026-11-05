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
  // Sinon cherche sur p+1 de l'autre machine de ce joueur
  for (const m of [group.harvester, group.bulldozer]) {
    if (m.position !== null) {
      const altIdx = Math.max(1, Math.min(maxIdx, m.position + 1));
      if (group.cells[altIdx - 1].tacticalDefenders < cap) {
        return altIdx;
      }
    }
  }
  // Sinon cherche la première case libre dès la case 2
  for (let c = 2; c <= maxIdx; c++) {
    if (group.cells[c - 1].tacticalDefenders < cap) {
      return c;
    }
  }
  return clampedPref;
}

/**
 * Exécute la Phase 2 (Étape 2.1 + Étape 2.2) pour les N joueurs selon les 4 profils d'IA gradués v3.2 :
 * 1. BLIND (Bot Aveugle)
 * 2. SOLO_INFORMED (Bot Informé Solo)
 * 3. COORD_HYBRID (Bot Coordonné Hybride — Référence)
 * 4. OMNISCIENT (Bot Omniscient — Plafond théorique)
 */
export function executePhase2Bots(
  config: SimulationConfig,
  groups: PlayerForestGroup[],
  draws: SecretVillainDraw[],
  botProfiles: BotProfileId[],
  _rng: SeededRNG
): DefenderPlacementDecision[] {
  const N = config.numPlayers;
  const cap = config.tacticalDefenderCap;
  const shift = config.combatThresholdShift;
  const decisions: DefenderPlacementDecision[] = [];

  // Si toute la table est OMNISCIENT, on utilise le planificateur global Omniscient
  if (botProfiles.every((b) => b === 'OMNISCIENT')) {
    return executeOmniscientTeamPhase2(config, groups, draws);
  }

  // MaxN est toujours actif en v3.2 (limitStealthTokensToN = true figé en dur)
  const existingStealthTokens = countActiveStealthTokensOnBoard(groups);
  const maxNewStealthTokensAllowed = Math.max(0, N - existingStealthTokens);
  let initiatedStealthPairsStep1 = 0;
  let completedStealthPairsStep2 = 0;

  // ==========================================================================
  // ÉTAPE 2.1 : Défense principale (chaque joueur k pose 1 jeton sur sa piste k)
  // ==========================================================================
  for (let k = 0; k < N; k++) {
    const profile = botProfiles[k % botProfiles.length];
    const ownGroup = groups[k];
    const ownDraw = draws[k];

    let chosenCell = 2;
    let chosenTrack: 'TACTICAL' | 'STEALTH' = 'TACTICAL';
    let reason = '';

    if (profile === 'BLIND') {
      // 1. BOT AVEUGLE : ignore totalement son tirage secret (T_k, P_k)
      // Pose son 1er Défenseur en Tactique sur p+1 de sa propre Abatteuse (ou Bulldozer si Abatteuse HS/DESTROYED)
      if (
        ownGroup.harvester.status === 'NORMAL' &&
        ownGroup.harvester.position !== null
      ) {
        chosenCell = ownGroup.harvester.position + 1;
        reason = `[Aveugle 2.1] Sans regarder son dé : protège son Abatteuse NORMAL en c=${chosenCell}`;
      } else if (
        ownGroup.bulldozer.status === 'NORMAL' &&
        ownGroup.bulldozer.position !== null
      ) {
        chosenCell = ownGroup.bulldozer.position + 1;
        reason = `[Aveugle 2.1] Abatteuse indisponible -> protège son Bulldozer NORMAL en c=${chosenCell}`;
      } else {
        const fallbackPos =
          ownGroup.harvester.position || ownGroup.bulldozer.position || 1;
        chosenCell = fallbackPos + 1;
        reason = `[Aveugle 2.1] Machines HS -> pose en Tactique sur c=${chosenCell}`;
      }
      chosenTrack = 'TACTICAL';
      chosenCell = findValidTacticalCellOnTrack(ownGroup, chosenCell, cap);
    } else if (profile === 'SOLO_INFORMED') {
      // 2. BOT INFORMÉ SOLO : utilise son tirage (T_k, P_k), mais zéro coordination et zéro Furtivité
      const drawnMachine = getTargetMachineForTactic(ownGroup, ownDraw.tactic);
      if (
        ownDraw.targetPlayerIndex === k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        chosenCell = drawnMachine.position + 1;
        reason = `[Solo 2.1] Dé personnel (${ownDraw.tactic}) cible sa propre machine ${drawnMachine.type} NORMAL -> Tactique en c=${chosenCell}`;
      } else if (
        ownGroup.harvester.status === 'NORMAL' &&
        ownGroup.harvester.position !== null
      ) {
        chosenCell = ownGroup.harvester.position + 1;
        reason = `[Solo 2.1] Dé cible J${ownDraw.targetPlayerIndex + 1} -> protège par défaut son Abatteuse en c=${chosenCell}`;
      } else if (
        ownGroup.bulldozer.status === 'NORMAL' &&
        ownGroup.bulldozer.position !== null
      ) {
        chosenCell = ownGroup.bulldozer.position + 1;
        reason = `[Solo 2.1] Protège par défaut son Bulldozer NORMAL en c=${chosenCell}`;
      } else {
        const fallbackPos =
          ownGroup.harvester.position || ownGroup.bulldozer.position || 1;
        chosenCell = fallbackPos + 1;
        reason = `[Solo 2.1] Garde Tactique de repli en c=${chosenCell}`;
      }
      chosenTrack = 'TACTICAL';
      chosenCell = findValidTacticalCellOnTrack(ownGroup, chosenCell, cap);
    } else {
      // 3. BOT COORDONNÉ HYBRIDE (Info privée + Signalement 2.1)
      const canSignalStealth =
        initiatedStealthPairsStep1 < maxNewStealthTokensAllowed;
      const drawnMachine = getTargetMachineForTactic(ownGroup, ownDraw.tactic);
      const isAssaultDraw =
        ownDraw.tactic === 'A3' || ownDraw.tactic === 'B3' ? 1 : 0;
      const selfTargetedNormal =
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

        // Si le plafond tactique permet d'atteindre au moins la Parade (avec l'aide d'un allié ou d'un piège), on signale en Tactique
        if (maxPossibleTacticalS >= minNeededForParry) {
          chosenCell = findValidTacticalCellOnTrack(ownGroup, targetC, cap);
          chosenTrack = 'TACTICAL';
          reason = `[Coord 2.1] Menace directe (${ownDraw.tactic}) sur sa piste -> Signal Tactique en c=${chosenCell}`;
        } else if (canSignalStealth) {
          // Si cap est trop bas pour parer cet Assaut sans Piège/Sabotage, lance un appel Furtivité en p+1 pour saboter la machine après le combat !
          chosenCell = targetC;
          chosenTrack = 'STEALTH';
          initiatedStealthPairsStep1 += 1;
          reason = `[Coord 2.1] Assaut non parable sous Cap=${cap} -> Signal Furtivité (1/2) en c=${chosenCell} pour Sabotage`;
        } else {
          chosenCell = findValidTacticalCellOnTrack(ownGroup, targetC, cap);
          chosenTrack = 'TACTICAL';
          reason = `[Coord 2.1] Menace directe (${ownDraw.tactic}) -> Défense Tactique en c=${chosenCell}`;
        }
      } else {
        // Son tirage cible un autre joueur (P_k != k) ou une machine HS :
        // Vérifier d'abord si une de ses machines NORMAL a déjà un Piège/Sabotage en p+1 à valoriser
        const harv = ownGroup.harvester;
        const bull = ownGroup.bulldozer;
        const harvBonus = getExistingPassiveBonusForNextCell(ownGroup, harv);
        const bullBonus = getExistingPassiveBonusForNextCell(ownGroup, bull);

        if (
          harv.status === 'NORMAL' &&
          harv.position !== null &&
          harvBonus >= 1 &&
          cap + harvBonus >= 2 + shift
        ) {
          chosenCell = findValidTacticalCellOnTrack(
            ownGroup,
            harv.position + 1,
            cap
          );
          chosenTrack = 'TACTICAL';
          reason = `[Coord 2.1] Valorise Piège/Sabotage actif (+${harvBonus}) devant Abatteuse en c=${chosenCell}`;
        } else if (
          bull.status === 'NORMAL' &&
          bull.position !== null &&
          bullBonus >= 1 &&
          cap + bullBonus >= 2 + shift
        ) {
          chosenCell = findValidTacticalCellOnTrack(
            ownGroup,
            bull.position + 1,
            cap
          );
          chosenTrack = 'TACTICAL';
          reason = `[Coord 2.1] Valorise Piège/Sabotage actif (+${bullBonus}) devant Bulldozer en c=${chosenCell}`;
        } else if (canSignalStealth) {
          // Envoie un signal d'appel en Piste Furtivité (stealthDefenders = 1) sur p+1 pour poser un Piège ou Sabotage !
          if (
            harv.status === 'NORMAL' &&
            harv.position !== null &&
            !ownGroup.cells[harv.position]?.hasTrap
          ) {
            chosenCell = harv.position + 1;
            chosenTrack = 'STEALTH';
            initiatedStealthPairsStep1 += 1;
            reason = `[Coord 2.1] Appel Furtivité (1/2) en c=${chosenCell} (devant Abatteuse) pour Piège/Sabotage`;
          } else if (
            bull.status === 'NORMAL' &&
            bull.position !== null &&
            !ownGroup.cells[bull.position]?.hasTrap
          ) {
            chosenCell = bull.position + 1;
            chosenTrack = 'STEALTH';
            initiatedStealthPairsStep1 += 1;
            reason = `[Coord 2.1] Appel Furtivité (1/2) en c=${chosenCell} (devant Bulldozer) pour Piège/Sabotage`;
          } else {
            const nextPos = (harv.position || bull.position || 1) + 1;
            if (!ownGroup.cells[nextPos - 1]?.hasTrap) {
              chosenCell = nextPos;
              chosenTrack = 'STEALTH';
              initiatedStealthPairsStep1 += 1;
              reason = `[Coord 2.1] Appel Furtivité (1/2) en c=${chosenCell} pour poser un Piège`;
            } else {
              chosenCell = findValidTacticalCellOnTrack(ownGroup, nextPos, cap);
              chosenTrack = 'TACTICAL';
              reason = `[Coord 2.1] Garde Tactique en c=${chosenCell}`;
            }
          }
        } else {
          // Réserve MaxN pleine -> pose en Piste Tactique
          const prefPos =
            harv.status === 'NORMAL' && harv.position !== null
              ? harv.position + 1
              : bull.status === 'NORMAL' && bull.position !== null
              ? bull.position + 1
              : (harv.position || bull.position || 1) + 1;
          chosenCell = findValidTacticalCellOnTrack(ownGroup, prefPos, cap);
          chosenTrack = 'TACTICAL';
          reason = `[Coord 2.1] Réserve Furtivité MaxN pleine -> Garde Tactique en c=${chosenCell}`;
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
    let chosenCell = 2;
    let chosenTrack: 'TACTICAL' | 'STEALTH' = 'TACTICAL';
    let reason = '';

    if (profile === 'BLIND') {
      // 1. BOT AVEUGLE : Pose son 2e Défenseur en Tactique sur p+1 de J1 (ou J2 si k == 0), sans regarder ce qu'ont posé les autres joueurs
      const preferredTargetP = k === 0 ? 1 : 0;
      const prefGroup = groups[preferredTargetP];
      const prefMachine =
        prefGroup.harvester.status === 'NORMAL'
          ? prefGroup.harvester
          : prefGroup.bulldozer;
      const desiredCell = (prefMachine.position || 1) + 1;
      const clampedCell = Math.max(
        1,
        Math.min(prefGroup.cells.length - 1, desiredCell)
      );

      if (prefGroup.cells[clampedCell - 1].tacticalDefenders < cap) {
        targetP = preferredTargetP;
        chosenCell = clampedCell;
        reason = `[Aveugle 2.2] Soutien mécanique aveugle sur J${targetP + 1} en c=${chosenCell}`;
      } else {
        // Plafond physique tacticalDefenderCap atteint sur cette case -> reporte sur une autre case/piste valide
        targetP = preferredTargetP;
        chosenCell = findValidTacticalCellOnTrack(prefGroup, clampedCell, cap);
        reason = `[Aveugle 2.2] Case c=${clampedCell} pleine (Cap=${cap}) -> repli aveugle sur J${targetP + 1} en c=${chosenCell}`;
      }
      chosenTrack = 'TACTICAL';
    } else if (profile === 'SOLO_INFORMED') {
      // 2. BOT INFORMÉ SOLO : Si P_k != k et machine NORMAL, pose en Tactique en p+1 de P_k sans regarder les jetons alliés
      const drawnP = ownDraw.targetPlayerIndex;
      const drawnGroup = groups[drawnP];
      const drawnMachine = getTargetMachineForTactic(drawnGroup, ownDraw.tactic);

      if (
        drawnP !== k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        targetP = drawnP;
        const desiredCell = drawnMachine.position + 1;
        chosenCell = findValidTacticalCellOnTrack(drawnGroup, desiredCell, cap);
        chosenTrack = 'TACTICAL';
        reason = `[Solo 2.2] Dé personnel (${ownDraw.tactic} -> J${targetP + 1}) : pose en Tactique sur c=${chosenCell} sans coordination`;
      } else {
        targetP = k === 0 ? 1 : 0;
        const fallbackGroup = groups[targetP];
        const m =
          fallbackGroup.harvester.status === 'NORMAL'
            ? fallbackGroup.harvester
            : fallbackGroup.bulldozer;
        chosenCell = findValidTacticalCellOnTrack(
          fallbackGroup,
          (m.position || 1) + 1,
          cap
        );
        chosenTrack = 'TACTICAL';
        reason = `[Solo 2.2] Dé personnel sur soi/HS -> repli individuel sur J${targetP + 1} en c=${chosenCell}`;
      }
    } else {
      // 3. BOT COORDONNÉ HYBRIDE (Coordination & Optimisation sans Overkill)
      const canCompleteStealth =
        completedStealthPairsStep2 < maxNewStealthTokensAllowed;
      let placed = false;

      // PRIORITÉ 1 : Utiliser son information privée (P_k != k) si cela permet d'atteindre un palier utile (Parade ou Mise HS) sans dépasser tacticalDefenderCap
      const drawnP = ownDraw.targetPlayerIndex;
      const drawnGroup = groups[drawnP];
      const drawnMachine = getTargetMachineForTactic(drawnGroup, ownDraw.tactic);
      const isKnownAssault =
        ownDraw.tactic === 'A3' || ownDraw.tactic === 'B3' ? 1 : 0;

      if (
        drawnP !== k &&
        drawnMachine.status === 'NORMAL' &&
        drawnMachine.position !== null
      ) {
        const cIdx = drawnMachine.position + 1;
        const cell = drawnGroup.cells[cIdx - 1];
        const passiveBonus = getExistingPassiveBonusForNextCell(
          drawnGroup,
          drawnMachine
        );
        const currentS = (cell?.tacticalDefenders || 0) + passiveBonus;
        const maxReachableS = cap + passiveBonus;
        const neededParryS = 2 + isKnownAssault + shift;
        const neededHSS = 3 + isKnownAssault + shift;

        if (
          cell &&
          cell.tacticalDefenders < cap &&
          currentS < neededHSS &&
          maxReachableS >= neededParryS
        ) {
          targetP = drawnP;
          chosenCell = cIdx;
          chosenTrack = 'TACTICAL';
          reason = `[Coord 2.2 - Prio 1] Info privée (${ownDraw.tactic} -> J${targetP + 1}) : renfort Tactique utile en c=${chosenCell} (S passe à ${currentS + 1})`;
          placed = true;
        } else if (
          canCompleteStealth &&
          cell &&
          cell.stealthDefenders === 1
        ) {
          // Si la case attaquée a un appel Furtivité (1/2), on le complète immédiatement !
          targetP = drawnP;
          chosenCell = cIdx;
          chosenTrack = 'STEALTH';
          completedStealthPairsStep2 += 1;
          reason = `[Coord 2.2 - Prio 1b] Complète la paire Furtivité (2/2) sur la case attaquée c=${chosenCell} de J${targetP + 1}`;
          placed = true;
        }
      }

      // PRIORITÉ 2 : Sécuriser une Mise HS (S = 3 + shift) ou Parade (S = 2 + shift) sur une case alliée ayant déjà Piège/Sabotage + Défenseur (ou signal Tactique 2.1)
      if (!placed) {
        for (let pIdx = 0; pIdx < N; pIdx++) {
          if (pIdx === k) continue;
          const g = groups[pIdx];
          for (const m of [g.harvester, g.bulldozer]) {
            if (m.status === 'NORMAL' && m.position !== null) {
              const cIdx = m.position + 1;
              const cell = g.cells[cIdx - 1];
              if (!cell || cell.tacticalDefenders >= cap) continue;
              const passiveBonus = getExistingPassiveBonusForNextCell(g, m);
              const currentS = cell.tacticalDefenders + passiveBonus;
              // Si S_curr >= 1 + shift et S_curr < 3 + shift (permet d'atteindre Parade 2+shift ou Mise HS 3+shift)
              if (
                currentS >= 1 + shift &&
                currentS < 3 + shift &&
                (passiveBonus >= 1 || cell.tacticalDefenders >= 1)
              ) {
                targetP = pIdx;
                chosenCell = cIdx;
                chosenTrack = 'TACTICAL';
                reason = `[Coord 2.2 - Prio 2] Synergie Tactique sur J${targetP + 1} en c=${chosenCell} (Bonus passif=${passiveBonus}, S passe à ${currentS + 1})`;
                placed = true;
                break;
              }
            }
          }
          if (placed) break;
        }
      }

      // PRIORITÉ 3 : Répondre impérativement aux appels Furtivité (stealthDefenders === 1) pour éviter tout jeton Furtivité orphelin
      if (!placed && canCompleteStealth) {
        for (let pIdx = 0; pIdx < N; pIdx++) {
          if (pIdx === k) continue;
          const g = groups[pIdx];
          for (const cell of g.cells) {
            if (cell.stealthDefenders === 1) {
              targetP = pIdx;
              chosenCell = cell.cellIndex;
              chosenTrack = 'STEALTH';
              completedStealthPairsStep2 += 1;
              reason = `[Coord 2.2 - Prio 3] Réponse à l'appel Furtivité (2/2) chez J${targetP + 1} en c=${chosenCell} (Zéro Furtivité Orpheline)`;
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }

      // PRIORITÉ 4 : S'il reste au moins un autre allié après k et de la place dans MaxN, ouvrir une paire Furtivité sur J1/J2 (qui sera complétée par l'allié suivant), sinon soutien Tactique sans Overkill
      if (!placed) {
        const remainingPlayersAfterK = N - 1 - k;
        if (canCompleteStealth && remainingPlayersAfterK >= 1) {
          const allyP = k === 0 ? 1 : 0;
          const allyG = groups[allyP];
          const prefC =
            (allyG.harvester.position || allyG.bulldozer.position || 1) + 1;
          const safeC = Math.max(1, Math.min(allyG.cells.length - 1, prefC));
          if (
            allyG.cells[safeC - 1].stealthDefenders === 0 &&
            !allyG.cells[safeC - 1].hasTrap
          ) {
            targetP = allyP;
            chosenCell = safeC;
            chosenTrack = 'STEALTH';
            reason = `[Coord 2.2 - Prio 4] Ouverture paire Furtivité (1/2) sur J${targetP + 1} en c=${chosenCell} pour l'allié suivant`;
            placed = true;
          }
        }
      }

      if (!placed) {
        // Fallback Tactique sans dépasser cap
        for (let pIdx = 0; pIdx < N; pIdx++) {
          if (pIdx === k) continue;
          const g = groups[pIdx];
          const m =
            g.harvester.status === 'NORMAL' ? g.harvester : g.bulldozer;
          const cIdx = Math.max(
            1,
            Math.min(g.cells.length - 1, (m.position || 1) + 1)
          );
          const cell = g.cells[cIdx - 1];
          const passiveBonus = getExistingPassiveBonusForNextCell(g, m);
          if (
            cell.tacticalDefenders < cap &&
            cell.tacticalDefenders + passiveBonus < 3 + shift
          ) {
            targetP = pIdx;
            chosenCell = cIdx;
            chosenTrack = 'TACTICAL';
            reason = `[Coord 2.2 - Fallback] Couverture Tactique sans Overkill sur J${targetP + 1} en c=${chosenCell}`;
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        targetP = k === 0 ? 1 : 0;
        const g = groups[targetP];
        chosenCell = findValidTacticalCellOnTrack(
          g,
          (g.harvester.position || 1) + 1,
          cap
        );
        chosenTrack = 'TACTICAL';
        reason = `[Coord 2.2 - Repli] Garde Tactique sur J${targetP + 1} en c=${chosenCell}`;
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
 * 4. BOT OMNISCIENT (Table ouverte / Plafond théorique)
 * Connaît la totalité des N tirages (T_1..T_N) à l'avance et alloue ses 2N Défenseurs
 * de manière globalement optimale (zéro jeton sur une case non attaquée, calcul exact de k_assault et shift).
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

  // Regrouper d'abord les tirages par machine pour anticiper ActRep (toujours actif en v3.2)
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
      // ActRep et PurgeSab sont toujours actifs en v3.2
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

    entry.dangerScore =
      (hasExplosionA || hasExplosionB ? 100 : 0) +
      overheatCount * 25 +
      entry.cards.length * 15 -
      entry.assaultK * 4;

    const neededForHS = Math.max(
      0,
      3 + entry.assaultK + shift - entry.passiveBonus
    );
    const neededForParry = Math.max(
      0,
      2 + entry.assaultK + shift - entry.passiveBonus
    );

    if (neededForHS <= cap && neededForHS <= 3) {
      entry.desiredTacticalDefenders = neededForHS;
    } else if (neededForParry <= cap) {
      entry.desiredTacticalDefenders = neededForParry;
    } else {
      // Impossible d'atteindre même la Parade à cause de tacticalDefenderCap : 0 jeton Tactique gaspillé !
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
        reason: `[Omniscient 2.1] Défense Tactique exacte sur case attaquée c=${ownTarget.cellIndex}`,
      });
    }
  }

  const openStealthCells: Array<{ playerIndex: number; cellIndex: number }> = [];
  for (let k = 0; k < N; k++) {
    if (step1Used[k]) continue;
    const g = groups[k];

    if (openStealthCells.length < maxNewStealthTokensAllowed) {
      // Choisir une case où une machine sera présente après 3.1 (pour Sabotage) ou la case p+2 inoccupée (pour Piège)
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
        reason: `[Omniscient 2.1] Ouverture paire Furtivité (1/2) en c=${safeCell}`,
      });
    } else {
      // Si aucune cible sur sa propre piste et réserve Furtivité pleine, pose sur une case libre sans dépasser cap
      const prefPos = (g.harvester.position || g.bulldozer.position || 1) + 1;
      const fallbackCell = findValidTacticalCellOnTrack(g, prefPos, cap);
      g.cells[fallbackCell - 1].tacticalDefenders += 1;
      step1Decisions.push({
        playerIndex: k,
        step: 1,
        targetPlayerIndex: k,
        cellIndex: fallbackCell,
        track: 'TACTICAL',
        reason: `[Omniscient 2.1] Garde Tactique en c=${fallbackCell} (Réserve MaxN atteinte)`,
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
        reason: `[Omniscient 2.2] Soutien Tactique exact sur J${allyCombat.playerIndex + 1} en c=${allyCombat.cellIndex}`,
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
        reason: `[Omniscient 2.2] Fermeture paire Furtivité (2/2) sur J${st.playerIndex + 1} en c=${st.cellIndex}`,
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
      reason: `[Omniscient 2.2] Renfort Tactique sur J${fallbackP + 1} en c=${fallbackCell}`,
    });
  }

  return decisions;
}
