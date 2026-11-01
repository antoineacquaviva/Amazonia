import React from 'react';
import { ThemeVocabularyMode } from '../sim/types';
import { DICTIONARIES, SWITCH_KEYS, SWITCH_META } from '../sim/i18n';

interface ReferenceAndI18nViewProps {
  vocabulary: ThemeVocabularyMode;
  onChangeVocabulary: (v: ThemeVocabularyMode) => void;
}

export const ReferenceAndI18nView: React.FC<ReferenceAndI18nViewProps> = ({
  vocabulary,
  onChangeVocabulary,
}) => {
  const dict = DICTIONARIES[vocabulary];
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Référence Terminologique — {dict['game.title']}
          </h2>
          <button
            onClick={() =>
              onChangeVocabulary(
                vocabulary === 'AMAZONIA' ? 'ABSTRACT' : 'AMAZONIA'
              )
            }
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Changer de vocabulaire
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {SWITCH_KEYS.map((key) => {
            const meta = SWITCH_META[key];
            return (
              <div
                key={key}
                className="p-2.5 rounded border border-slate-200 dark:border-slate-800"
              >
                <div className="font-semibold">{meta.title}</div>
                <div className="text-slate-500 mt-0.5">{meta.v2HumanDesc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
