import React, { useCallback, useRef, useState } from 'react';
import CameraView from './components/CameraView.jsx';
import TermoBoard from './components/TermoBoard.jsx';
import AlphabetGuide from './components/AlphabetGuide.jsx';
import { pickRandomWord } from './lib/words.js';

const HOLD_FRAMES = 14;
const WORD_LENGTH = 4;

function evaluateGuess(guess, secret) {
  const result = Array(WORD_LENGTH).fill('absent');
  const secretArr = secret.split('');
  const guessArr = guess.split('');
  const used = Array(WORD_LENGTH).fill(false);
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === secretArr[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessArr[i] === secretArr[j]) {
        result[i] = 'present';
        used[j] = true;
        break;
      }
    }
  }
  return result;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [game, setGame] = useState(() => { const [w,h] = pickRandomWord([]); return {word:w,hint:h}; });
  const [guesses, setGuesses] = useState([]);
  const [currentLetters, setCurrentLetters] = useState([]);
  const [won, setWon] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [recognised, setRecognised] = useState({ letter: null, confidence: 0, progress: 0 });
  const historyRef = useRef([]);

  const startNewGame = useCallback(() => {
    historyRef.current = [...historyRef.current, game.word].slice(-20);
    const [w,h] = pickRandomWord(historyRef.current);
    setGame({ word: w, hint: h });
    setGuesses([]);
    setCurrentLetters([]);
    setWon(false);
  }, [game.word]);

  const lastCommittedAtRef = useRef(0);

  const onRecognition = useCallback((info) => {
    setRecognised(info);
    if (!info.committed || won) return;
    // Defesa extra: só aceitar um "committed" de letra única e suportada,
    // e ignorar dois commits a chegarem com menos de 200ms de intervalo
    // (sinal de eventos duplicados/concorrentes em vez de um gesto novo).
    const isValidLetter = typeof info.committed === 'string' && info.committed.length === 1;
    if (!isValidLetter) return;
    const now = performance.now();
    if (now - lastCommittedAtRef.current < 200) return;
    lastCommittedAtRef.current = now;
    setCurrentLetters(prev => {
      if (prev.length >= WORD_LENGTH) return prev;
      return [...prev, info.committed];
    });
  }, [won]);

  const submitGuess = useCallback(() => {
    if (currentLetters.length !== WORD_LENGTH) return;
    const result = evaluateGuess(currentLetters.join(''), game.word);
    setGuesses(prev => [...prev, { letters: currentLetters, result }]);
    setCurrentLetters([]);
    if (result.every(r => r === 'correct')) setWon(true);
  }, [currentLetters, game.word]);

  const deleteLetter = useCallback(() => {
    setCurrentLetters(prev => (prev.length === 0 ? prev : prev.slice(0, -1)));
  }, []);

  if (!started) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <div className="splash-logo">
            <span className="splash-g">T</span>
            <span className="splash-rest">ermo</span>
          </div>
          <div>
            <span className="splash-tag">Língua Gestual Portuguesa</span>
          </div>
          <p className="splash-sub">Adivinha a palavra secreta fazendo gestos LGP com a câmara</p>
          <div className="splash-how">
            <div className="how-step"><span className="how-num">1</span><span>Há uma palavra secreta de 4 letras</span></div>
            <div className="how-step"><span className="how-num">2</span><span>Faz gestos LGP para escrever o teu palpite</span></div>
            <div className="how-step"><span className="how-num">3</span><span>🟩 certo · 🟨 errado lugar · ⬛ não existe</span></div>
          </div>
          <div className="splash-actions">
            <button className="btn-start" onClick={() => setStarted(true)}>Começar a jogar</button>
            <button className="btn-guide" onClick={() => setShowGuide(true)}>Ver gestos LGP</button>
          </div>
          <p className="splash-note">Câmara usada só no teu dispositivo — nenhum dado é enviado</p>
        </div>
        {showGuide && <AlphabetGuide onClose={() => setShowGuide(false)} />}
      </div>
    );
  }

  const listening = !won && currentLetters.length < WORD_LENGTH;

  return (
    <div className="game-shell">
      <div className="hud-top">
        <button className="hud-btn" onClick={() => setShowGuide(true)} title="Ver gestos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </button>
        <div className="hud-title">TERMO</div>
        <button className="hud-btn" onClick={startNewGame} title="Nova palavra">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      <CameraView
        target={listening ? '_LISTEN_' : null}
        holdFrames={HOLD_FRAMES}
        onRecognition={onRecognition}
        recognised={recognised}
        currentLetters={currentLetters}
        wordLength={WORD_LENGTH}
      />

      <TermoBoard
        guesses={guesses}
        currentLetters={currentLetters}
        wordLength={WORD_LENGTH}
        won={won}
        secretWord={game.word}
        hint={game.hint}
        recognised={recognised}
        onSubmit={submitGuess}
        onDelete={deleteLetter}
        onNewGame={startNewGame}
      />

      {showGuide && <AlphabetGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}