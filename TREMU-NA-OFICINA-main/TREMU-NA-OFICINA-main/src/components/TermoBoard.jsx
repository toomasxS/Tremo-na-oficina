import React, { useState } from 'react';

const STATUS_COLOR = {
  correct: 'tile-correct',
  present: 'tile-present',
  absent: 'tile-absent',
};

export default function TermoBoard({
  guesses, currentLetters, wordLength, won,
  secretWord, hint, recognised, onSubmit, onDelete, onNewGame
}) {
  const [hintOpen, setHintOpen] = useState(false);
  const progress = recognised?.progress || 0;
  const candidate = recognised?.candidate;

  const rows = [...guesses];
  if (!won) rows.push({ letters: currentLetters, result: null });

  return (
    <div className="bottom-panel">
      <div className="termo-grid">
        {rows.map((row, ri) => {
          const isCurrent = !won && ri === rows.length - 1;
          return (
            <div key={ri} className="termo-row">
              {Array.from({ length: wordLength }).map((_, ci) => {
                const letter = row.letters[ci] || '';
                const status = row.result ? row.result[ci] : null;
                const isActive = isCurrent && ci === currentLetters.length && progress > 0;
                let cls = 'termo-tile';
                if (status) cls += ' ' + STATUS_COLOR[status];
                else if (isCurrent && letter) cls += ' termo-tile-filled';
                else if (!letter) cls += ' termo-tile-empty';

                return (
                  <div key={ci} className={cls}>
                    {letter}
                    {isActive && (
                      <div className="tile-progress" style={{ width: `${Math.round(progress * 100)}%` }} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {!won && currentLetters.length < wordLength && candidate && (
        <div className="termo-detecting">
          <span className="detecting-label">A detectar:</span>
          <span className="detecting-letter">{candidate}</span>
        </div>
      )}

      {!won && (
        <div className="termo-actions">
          <button className="btn-action btn-delete" onClick={onDelete} disabled={currentLetters.length === 0}>
            ← Apagar
          </button>
          <button className="btn-action btn-submit" onClick={onSubmit} disabled={currentLetters.length !== wordLength}>
            Submeter ✓
          </button>
        </div>
      )}

      {won && (
        <div className="won-banner">
          <span className="won-emoji">🎉</span>
          <span className="won-text">Acertaste! Era <strong>{secretWord}</strong></span>
          <button className="btn-start" onClick={onNewGame}>Nova palavra</button>
        </div>
      )}

      <button className="hint-toggle" onClick={() => setHintOpen(o => !o)}>
        {hintOpen ? '▲ esconder pista' : '▼ ver pista'}
      </button>
      {hintOpen && <div className="hint-box">{hint}</div>}
    </div>
  );
}