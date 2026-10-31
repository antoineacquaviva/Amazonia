import { DiceDrawMode } from './types';

/**
 * Générateur pseudo-aléatoire déterministe (Mulberry32)
 * Permet de rejouer à l'identique n'importe quelle partie ou anomalie à partir de sa graine (seed).
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier aléatoire uniforme dans [min, max] inclus */
  public nextInt(min: number, max: number): number {
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }

  /** Mélange de Fisher-Yates en place et retourne le tableau */
  public shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  /** Lance les dés de programmation d'un joueur selon ModeTirageDes */
  public rollTacticDice(mode: DiceDrawMode): { d1: number; d2: number; chosenSlot: number } {
    const d1 = this.nextInt(1, 6);
    const d2 = this.nextInt(1, 6);
    let chosenSlot = Math.min(d1, d2);
    if (mode === '1D6') {
      chosenSlot = d1;
    } else if (mode === 'MAX_2D6') {
      chosenSlot = Math.max(d1, d2);
    }
    return { d1, d2, chosenSlot };
  }
}

/**
 * Retourne la distribution de probabilité a priori P(k) pour k = 1..6 (index 0..5)
 */
export function getPriorProbabilities(mode: DiceDrawMode): number[] {
  if (mode === '1D6') {
    return [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
  }
  if (mode === 'MAX_2D6') {
    // P(k) = (2k - 1) / 36
    return [1 / 36, 3 / 36, 5 / 36, 7 / 36, 9 / 36, 11 / 36];
  }
  // Par défaut MIN_2D6 : P(k) = (13 - 2k) / 36
  return [11 / 36, 9 / 36, 7 / 36, 5 / 36, 3 / 36, 1 / 36];
}
