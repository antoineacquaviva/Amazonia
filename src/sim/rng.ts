/**
 * Générateur pseudo-aléatoire déterministe (Mulberry32)
 * Permet de rejouer à l'identique n'importe quelle partie à partir de sa graine (seed).
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

  public shuffleInPlace<T>(array: T[]): T[] {
    return this.shuffle(array);
  }

  /** Lance les deux dés différenciés D1 (Majeur) et D2 (Mineur) et calcule M = min(D1, D2) */
  public roll2D6(): { d1: number; d2: number; mIndex: number } {
    const d1 = this.nextInt(1, 6);
    const d2 = this.nextInt(1, 6);
    return {
      d1,
      d2,
      mIndex: Math.min(d1, d2),
    };
  }
}
