import React, { useEffect, useRef, useState } from 'react';
import { loadHandLandmarker, attachCamera, stopCamera } from '../lib/handTracker.js';
import { classify, createStabilityFilter } from '../lib/lgpAlphabet.js';

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

// Contador global partilhado por todas as instâncias do componente, usado
// para identificar de forma inequívoca qual a invocação mais recente do
// efeito de câmara (ver comentário detalhado dentro do useEffect).
let cameraInstanceCounter = 0;

export default function CameraView({ target, holdFrames, onRecognition, recognised, currentLetters, wordLength }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const filterRef = useRef(null);
  if (!filterRef.current) {
    filterRef.current = createStabilityFilter({ holdFrames, minConf: 0.78 });
  }
  const targetRef = useRef(target);
  const onRecognitionRef = useRef(onRecognition);
  const lastVideoTimeRef = useRef(-1);
  const lastSentRef = useRef(null);
  const activeInstanceRef = useRef(0);
  const cancelledRef = useRef(new Set());
  const [status, setStatus] = useState('A preparar a câmara…');
  const [error, setError] = useState(null);

  useEffect(() => { targetRef.current = target; filterRef.current.clearLock(); }, [target]);
  useEffect(() => { onRecognitionRef.current = onRecognition; }, [onRecognition]);

  useEffect(() => {
    // Em React.StrictMode (modo de desenvolvimento), o React monta,
    // desmonta e volta a montar este efeito de propósito, para apanhar
    // efeitos secundários mal limpos. Sem proteção, isto criava DOIS loops
    // de deteção em paralelo por breves instantes — cada um com o seu
    // próprio filtro de estabilidade — o que fazia comprometer duas letras
    // quase ao mesmo tempo (ex.: "U" de um loop e algo parecido com "M" do
    // outro), aparecendo concatenadas no mesmo quadrado ("UM"). Também
    // deixava streams de câmara a competir entre si, o que por vezes
    // resultava em ecrã preto depois de qualquer interação (como apagar).
    // A variável `instanceId` garante que só a invocação MAIS RECENTE do
    // efeito pode atualizar estado ou desenhar — instâncias antigas tornam-se
    // no-ops assim que são limpas.
    cameraInstanceCounter += 1;
    const instanceId = cameraInstanceCounter;
    let landmarker = null;
    let localRafId = 0;
    let instanceStream = null;

    function isCurrent() {
      return !cancelledRef.current.has(instanceId) && activeInstanceRef.current === instanceId;
    }

    activeInstanceRef.current = instanceId;

    (async () => {
      try {
        setStatus('A carregar modelo…');
        landmarker = await loadHandLandmarker();
        if (!isCurrent()) return;
        setStatus('A ligar câmara…');
        const stream = await attachCamera(videoRef.current);
        if (!isCurrent()) {
          // Esta instância já foi substituída enquanto esperava pela câmara —
          // fechar imediatamente o stream que acabou de abrir para não ficar
          // nenhuma câmara "fantasma" a correr ao mesmo tempo que a atual.
          stopCamera(stream);
          return;
        }
        instanceStream = stream;
        streamRef.current = stream;
        setStatus(null);
        loop();
      } catch (e) {
        if (!isCurrent()) return;
        setError(e?.message || 'Erro desconhecido');
      }
    })();

    function emit(payload) {
      if (!isCurrent()) return;
      const prev = lastSentRef.current;
      if (prev &&
        prev.letter === payload.letter &&
        prev.candidate === payload.candidate &&
        prev.committed === payload.committed &&
        prev.progress === payload.progress
      ) return;
      lastSentRef.current = payload;
      onRecognitionRef.current?.(payload);
    }

    function loop() {
      if (!isCurrent()) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !landmarker) return;

      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        let result;
        try { result = landmarker.detectForVideo(video, performance.now()); }
        catch (e) { result = null; }

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let rec = { letter: null, confidence: 0 };
        if (result?.landmarks?.length) {
          const lm = result.landmarks[0];
          drawHand(ctx, lm, canvas.width, canvas.height);
          rec = classify(lm);
        }
        ctx.restore();

        const isListening = targetRef.current === '_LISTEN_';
        const filt = isListening
          ? filterRef.current.push(rec)
          : { candidate: rec.letter, committed: null, progress: 0 };

        emit({
          letter: rec.letter,
          confidence: rec.confidence,
          candidate: filt.candidate,
          committed: isListening ? filt.committed : null,
          progress: isListening ? filt.progress : 0,
          target: targetRef.current,
        });
      }
      localRafId = requestAnimationFrame(loop);
      rafRef.current = localRafId;
    }

    return () => {
      // Marcar esta instância como cancelada (em vez de uma flag booleana
      // partilhada) para que, mesmo que o StrictMode tenha criado uma
      // instância nova entretanto, só ESTA paragem feche ESTE stream/RAF —
      // nunca os da instância seguinte, que pode já estar a correr.
      cancelledRef.current.add(instanceId);
      cancelAnimationFrame(localRafId);
      stopCamera(streamRef.current === instanceStream ? streamRef.current : instanceStream);
      if (streamRef.current === instanceStream) streamRef.current = null;
      lastVideoTimeRef.current = -1;
    };
  }, []);

  const progress = recognised?.progress || 0;
  const candidate = recognised?.candidate;
  const listening = target === '_LISTEN_';

  return (
    <div className="cam-wrap">
      <video ref={videoRef} playsInline muted className="cam-video" />
      <canvas ref={canvasRef} className="cam-canvas" />

      {!status && !error && (
        <div className="cam-target-badge">
          <span className="cam-target-label">{listening ? 'gesto' : 'pausado'}</span>
          <span className="cam-target-letter" style={{ fontSize: '1.1rem', opacity: 0.5 }}>
            {currentLetters.length}/{wordLength}
          </span>
        </div>
      )}

      {!status && !error && candidate && listening && (
        <div className={`cam-detected-badge ${progress > 0.5 ? 'match' : ''}`}>
          <span className="cam-target-label">vejo</span>
          <span className="cam-target-letter">{candidate}</span>
        </div>
      )}

      {!status && !error && progress > 0 && listening && (
        <div className="cam-progress-bar">
          <div className="cam-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

      {(status || error) && (
        <div className={`cam-overlay ${error ? 'error' : ''}`}>
          {!error && <div className="cam-spinner" />}
          <p>{error ? `Erro: ${error}` : status}</p>
          {error && <p className="cam-overlay-hint">Verifica as permissões da câmara e recarrega.</p>}
        </div>
      )}
    </div>
  );
}

function drawHand(ctx, lm, w, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
}