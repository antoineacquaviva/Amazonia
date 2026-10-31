import React from 'react';
import { ThemeVocabularyMode } from '../sim/types';
import { DICTIONARIES, VocabularyDictionary } from '../sim/i18n';

interface ReferenceAndI18nViewProps {
  vocabulary: ThemeVocabularyMode;
  onChangeVocabulary: (mode: ThemeVocabularyMode) => void;
}

export const ReferenceAndI18nView: React.FC<ReferenceAndI18nViewProps> = ({
  vocabulary,
  onChangeVocabulary,
}) => {
  const keys = Object.keys(DICTIONARIES.AMAZONIA) as Array<
    keyof VocabularyDictionary
  >;

  return (
    <div className="space-y-8">
      {/* Méthodologie Mathématique des 4 Critères d'Évaluation */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            01. Modélisation Mathématique des 4 Critères de Game Design
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Formules quantitatives utilisées par le moteur d’évaluation pour noter chaque variante de règles sur 100.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              1. Simplicité et Ergonomie (Fluidité & Charge de Manipulation)
            </h3>
            <p>
              Évalue l’absence de frictions mécaniques et de manipulations à vide lors d’un tour physique sur table :
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>Taux de résolution directe (40%)</strong> : proportion de cartes Manœuvre ayant un effet réel (ni annulées « sans objet » faute de cible en Étape 3, ni non posées en H1).
              </li>
              <li>
                <strong>Sobriété des manipulations (35%)</strong> : inverse normalisé du nombre de permutations par tour sur la Piste des Tactiques et l’Œil du Contremaître + repositionnements de fin de tour.
              </li>
              <li>
                <strong>Convergence & Rareté des exceptions (25%)</strong> : rapidité de verrouillage en Étape 2 et faible fréquence des cas limites complexes (H1–H6).
              </li>
            </ul>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2. Intérêt Stratégique (Profondeur, Maîtrise & Équité)
            </h3>
            <p>
              Mesure à quel point la compréhension fine du Cerveau du Contremaître est récompensée sans biais de mise en place :
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>Écart de compétence / Skill Gap (50%)</strong> : gain de préservation entre le <em>Bot Stratège N3</em> (qui contrôle l’Apprentissage et la Rancune) et le <em>Bot Égoïste N1</em>, ainsi qu’entre N1 et le <em>Bot Aléatoire</em>.
              </li>
              <li>
                <strong>Entropie de Shannon de la Case 1 (25%)</strong> : diversité de rotation des 6 tactiques (A1..B3) en tête de piste, pénalisant le blocage permanent d’une même tuile.
              </li>
              <li>
                <strong>Équité des Rangs initiaux sur l’Œil (25%)</strong> : homogénéité du taux d’arbres sauvés entre les secteurs démarrant aux Rangs 1, 2, 3 et 4..n.
              </li>
            </ul>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              3. Tension et Choix Difficiles (Dilemmes & Courbe Dramatique)
            </h3>
            <p>
              Évalue l’intensité dramatique de la partie et la difficulté des arbitrages défensifs :
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>Zone de tension optimale (40%)</strong> : proximité du taux de survie coopératif (N2) avec la cible de 68% (évitant à la fois les victoires triviales &gt;90% et les défaites écrasantes &lt;40%).
              </li>
              <li>
                <strong>Taux de parties serrées (35%)</strong> : proportion de parties qui se jouent entre 45% et 82% ou dont le palier de victoire bascule grâce à la Régénération finale.
              </li>
              <li>
                <strong>Fréquence de dilemmes décisionnels (25%)</strong> : proportion de placements où l’écart d’utilité marginale entre les 2 meilleures options d’un Bot est inférieur à 15%.
              </li>
            </ul>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              4. Intérêt à Collaborer Efficacement (Gain Coopératif & Signalisation)
            </h3>
            <p>
              Quantifie la valeur ajoutée de la communication muette en temps réel lors de l’Étape 2 :
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>Gain pur de communication muette (40%)</strong> : écart de score normalisé entre une équipe <em>Coopérative Communicante (N2)</em> et une équipe <em>Égoïste Myope (N1)</em>.
              </li>
              <li>
                <strong>Fréquence des destructions collectives (30%)</strong> : nombre d’embuscades d’Abatteuses (D=2) et d’assauts de Bulldozers (D≥3) exigeant la convergence d’au moins un allié.
              </li>
              <li>
                <strong>Efficacité informationnelle & Anti-Overkill (30%)</strong> : réduction des doublons grâce aux micro-cycles et proximité avec la borne haute du <em>Bot Omniscient</em>.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Table de Traduction et Vocabulaire i18n */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              02. Table de Localisation & Dictionnaire Thématique (i18n)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sépare le moteur mathématique de l’habillage éditorial (Section 2.6 de la Spécification Fonctionnelle).
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              onClick={() => onChangeVocabulary('AMAZONIA')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                vocabulary === 'AMAZONIA'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Thème Amazonia (Actif)
            </button>
            <button
              onClick={() => onChangeVocabulary('ABSTRACT')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                vocabulary === 'ABSTRACT'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Notes Techniques d’Origine
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Clé Système (i18n_key)</th>
                <th className="py-2 px-4 font-medium">Thème Amazonia (Par défaut)</th>
                <th className="py-2 pl-4 font-medium">Notes Techniques d’Origine (Abstrait)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {keys.map((k) => {
                const valAmz = DICTIONARIES.AMAZONIA[k];
                const valAbs = DICTIONARIES.ABSTRACT[k];
                return (
                  <tr key={k}>
                    <td className="py-2 pr-4 font-mono text-slate-700 dark:text-slate-300">
                      {k}
                    </td>
                    <td className="py-2 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {Array.isArray(valAmz) ? valAmz.join(', ') : valAmz}
                    </td>
                    <td className="py-2 pl-4 text-slate-600 dark:text-slate-400">
                      {Array.isArray(valAbs) ? valAbs.join(', ') : valAbs}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
