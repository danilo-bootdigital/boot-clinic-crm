'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/messaging/media-client';

/**
 * PLAYER DE NOTA DE VOZ — por que não é um `<audio controls src={signedUrl}>`.
 *
 * Três defeitos reais do caminho ingênuo, todos capazes de parar a reprodução
 * poucos segundos depois do play:
 *
 * 1. STREAMING POR RANGE + URL EFÊMERA. A signed URL do bucket vive 5 minutos.
 *    O `<audio>` só busca bytes quando o usuário aperta play e continua pedindo
 *    faixas (`Range`) durante a reprodução. Conversa aberta há mais de 5 min, ou
 *    uma faixa que falha no meio, e o áudio para sem erro visível — o elemento
 *    simplesmente considera que acabou. Aqui a mídia é baixada INTEIRA como blob
 *    antes de tocar, e a URL é pedida no clique (nunca expira antes do uso).
 *
 * 2. DURAÇÃO DO CONTAINER NÃO É CONFIÁVEL. Nota de voz do WhatsApp é Ogg/Opus
 *    gravado em fluxo, e gravação local do navegador é WebM do MediaRecorder:
 *    nos dois casos o container costuma chegar sem duração utilizável. O
 *    navegador reporta `Infinity` ou um valor curto e errado, e encerra a
 *    reprodução nesse ponto. A duração autoritativa vem do provedor
 *    (`durationSeconds`); sem ela, forçamos o navegador a materializar a duração
 *    real com uma busca ao fim do arquivo.
 *
 * 3. FIM PREMATURO. Se o elemento disparar `ended` bem antes da duração
 *    conhecida, o container mentiu. Nesse caso decodificamos o arquivo inteiro
 *    com a Web Audio API — que decodifica todos os quadros presentes, ignorando
 *    o cabeçalho — e retomamos de onde parou.
 *
 * Quando o navegador não sabe decodificar o codec de jeito nenhum (Safari com
 * Ogg/Opus, por exemplo), o player diz isso e oferece o download em vez de
 * falhar em silêncio.
 */

interface Props {
  /** Anexo do banco: a signed URL é pedida sob demanda por este id. */
  attachmentId?: string;
  /** Fonte já disponível (ex.: preview de gravação local). Dispensa o fetch. */
  src?: string;
  mimeType?: string;
  sizeBytes?: number | null;
  /** Duração declarada pelo provedor — autoritativa quando presente. */
  durationSeconds?: number | null;
  fileName?: string | null;
  dark?: boolean;
  className?: string;
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';
type Engine = 'element' | 'buffer';

// Acima disto a decodificação para PCM na memória fica caro (float32 estéreo a
// 48 kHz consome ~23 MB por minuto), então o fallback não é oferecido.
const MAX_DECODE_BYTES = 8 * 1024 * 1024;

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Teto de bitrate por formato, em bits por segundo. Serve a UMA pergunta: a
 * duração que o navegador informou é curta demais para um arquivo deste tamanho?
 * Se um Ogg de 200 KB alega 2 segundos, seriam 800 kbps de voz — impossível, e o
 * cabeçalho está mentindo.
 *
 * Isto é o que cobre os áudios recebidos ANTES de o sistema passar a guardar a
 * duração declarada pelo WhatsApp: para eles não há duração autoritativa no
 * banco, só o tamanho do arquivo.
 */
const MAX_BITRATE: Record<string, number> = {
  'audio/ogg': 64_000, // Opus de voz; PTT do WhatsApp fica bem abaixo disso
  'audio/webm': 128_000, // MediaRecorder do navegador
  'audio/mp4': 256_000,
  'audio/mpeg': 320_000,
};

// Duração mínima compatível com o tamanho do arquivo. 0 = não dá para afirmar
// nada (formato sem teto conhecido, como WAV, ou tamanho ausente).
function minPlausibleDuration(mime: string | undefined, sizeBytes: number | null | undefined): number {
  const ceiling = MAX_BITRATE[String(mime || '').split(';')[0].trim().toLowerCase()];
  if (!ceiling || !sizeBytes || sizeBytes <= 0) return 0;
  return (sizeBytes * 8) / ceiling;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Materializa a duração de um container que não a declara. Buscar uma posição
 * absurda faz o navegador percorrer o arquivo até o fim e só então publicar
 * `duration`; depois voltamos ao início. Sem isto, `duration` fica `Infinity` e
 * a barra de progresso não existe.
 */
function forceDurationResolution(el: HTMLAudioElement): Promise<number> {
  if (Number.isFinite(el.duration) && el.duration > 0) return Promise.resolve(el.duration);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      el.removeEventListener('timeupdate', onTimeUpdate);
      clearTimeout(timer);
      try { el.currentTime = 0; } catch { /* alguns navegadores recusam antes do seek terminar */ }
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const onTimeUpdate = () => finish(el.duration);
    const timer = setTimeout(() => finish(el.duration), 3000); // não trava a UI se o seek não resolver
    el.addEventListener('timeupdate', onTimeUpdate);
    try { el.currentTime = 1e101; } catch { finish(el.duration); }
  });
}

export function AudioMessagePlayer({
  attachmentId, src, mimeType, sizeBytes, durationSeconds, fileName, dark, className,
}: Props) {
  const [phase, setPhase] = useState<Phase>(src ? 'ready' : 'idle');
  const [engine, setEngine] = useState<Engine>('element');
  const [objectUrl, setObjectUrl] = useState<string | null>(src ?? null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [elementDuration, setElementDuration] = useState(0);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const pendingPlayRef = useRef(false); // play pedido antes de o elemento existir
  const resolvingRef = useRef(false); // ignora timeupdate durante a busca de duração
  const createdUrlRef = useRef<string | null>(null); // o que ESTE player precisa revogar
  const engineRef = useRef<Engine>('element'); // leitura síncrona dentro de handlers

  // --- estado do motor Web Audio (fallback para container mentiroso) ---
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0); // relógio do contexto no momento do play
  const offsetRef = useRef(0); // posição dentro do buffer no momento do play
  const stoppingRef = useRef(false); // distingue stop() manual de fim natural
  const rafRef = useRef<number | null>(null);

  const providerDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : 0;
  // Ordem de confiança: provedor > buffer decodificado > palpite do elemento.
  const duration = providerDuration || bufferDuration || elementDuration;
  // Piso derivado do tamanho do arquivo — a rede de segurança dos áudios antigos,
  // que não têm duração declarada guardada.
  const floorDuration = providerDuration ? 0 : minPlausibleDuration(mimeType, sizeBytes);
  // Duração de referência para "acabou cedo demais": a melhor evidência disponível.
  const expectedDuration = providerDuration || Math.max(bufferDuration, floorDuration);
  const muted = dark ? 'text-white/80' : 'text-muted-foreground';

  // Desmontagem: só revoga a URL que ESTE player criou (a de `src` pertence a quem
  // a passou). Lê de ref porque o efeito de limpeza roda uma única vez.
  useEffect(() => () => {
    if (createdUrlRef.current) URL.revokeObjectURL(createdUrlRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { nodeRef.current?.stop(); } catch { /* já parado */ }
    void ctxRef.current?.close();
  }, []);

  // Baixa a mídia inteira: signed URL pedida AGORA (não na renderização) e bytes
  // em memória, para que a reprodução não dependa mais de rede nem da validade da URL.
  const load = useCallback(async (): Promise<string | null> => {
    if (objectUrl) return objectUrl;
    if (!attachmentId) return null;
    setPhase('loading');
    setError(null);
    try {
      const metaRes = await fetch(`/api/mensageria/attachments/${attachmentId}`, { cache: 'no-store' });
      if (!metaRes.ok) throw new Error('acesso ao anexo indisponível');
      const meta = await metaRes.json();
      if (!meta?.url) throw new Error('anexo sem URL');

      const fileRes = await fetch(meta.url, { cache: 'no-store' });
      if (!fileRes.ok) throw new Error(`download falhou (${fileRes.status})`);
      const bytes = await fileRes.arrayBuffer();
      if (!bytes.byteLength) throw new Error('arquivo vazio');

      bytesRef.current = bytes;
      const url = URL.createObjectURL(new Blob([bytes], { type: meta.mimeType || mimeType || 'audio/ogg' }));
      createdUrlRef.current = url;
      setObjectUrl(url);
      setPhase('ready');
      return url;
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'falha ao carregar');
      return null;
    }
  }, [attachmentId, mimeType, objectUrl]);

  // --- motor Web Audio ---

  const stopBufferNode = useCallback(() => {
    if (!nodeRef.current) return;
    stoppingRef.current = true;
    try { nodeRef.current.stop(); } catch { /* já parado */ }
    nodeRef.current.disconnect();
    nodeRef.current = null;
    stoppingRef.current = false;
  }, []);

  const tickBuffer = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !nodeRef.current) return;
    const elapsed = (ctx.currentTime - startedAtRef.current) * speed;
    setPosition(Math.min(offsetRef.current + elapsed, bufferRef.current?.duration ?? Infinity));
    rafRef.current = requestAnimationFrame(tickBuffer);
  }, [speed]);

  const playBuffer = useCallback((fromSeconds: number) => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;
    stopBufferNode();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = speed;
    node.connect(ctx.destination);
    node.onended = () => {
      if (stoppingRef.current) return; // parada manual (pause/seek)
      setPlaying(false);
      setPosition(buffer.duration);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    offsetRef.current = Math.max(0, Math.min(fromSeconds, buffer.duration));
    startedAtRef.current = ctx.currentTime;
    node.start(0, offsetRef.current);
    nodeRef.current = node;
    setPlaying(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tickBuffer);
  }, [speed, stopBufferNode, tickBuffer]);

  /**
   * Decodifica o arquivo inteiro com a Web Audio API. `decodeAudioData` percorre
   * todos os quadros presentes no arquivo, então não herda a duração errada do
   * cabeçalho — é daqui que sai a duração verdadeira de um container mentiroso.
   */
  const decodeBuffer = useCallback(async (): Promise<AudioBuffer | null> => {
    if (bufferRef.current) return bufferRef.current;
    const bytes = bytesRef.current;
    if (!bytes || bytes.byteLength > MAX_DECODE_BYTES) return null;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = ctxRef.current ?? new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      // decodeAudioData consome (detacha) o ArrayBuffer: decodifica uma cópia.
      bufferRef.current = await ctx.decodeAudioData(bytes.slice(0));
      setBufferDuration(bufferRef.current.duration);
      return bufferRef.current;
    } catch {
      return null;
    }
  }, []);

  // Passa a tocar do buffer decodificado, retomando na posição informada.
  const switchToBuffer = useCallback(async (fromSeconds: number): Promise<boolean> => {
    const buffer = await decodeBuffer();
    if (!buffer) return false;
    // A ref muda ANTES do estado: o `pause()` abaixo dispara um evento `pause`
    // que chegaria depois, apagando o "tocando" que playBuffer acabou de ligar.
    engineRef.current = 'buffer';
    setEngine('buffer');
    audioRef.current?.pause();
    playBuffer(fromSeconds);
    return true;
  }, [decodeBuffer, playBuffer]);

  // --- controles ---

  // Reprodução pelo `<audio>`, com as duas saídas para container problemático.
  const startElementPlayback = useCallback(async () => {
    const target = audioRef.current;
    if (!target) return;
    // Codec que o navegador declara não suportar (Safari com Ogg/Opus, por
    // exemplo): nem tenta pelo elemento, vai direto para a decodificação.
    if (mimeType && target.canPlayType(mimeType) === '' && (await switchToBuffer(position))) return;
    // Já sabemos que o container declara menos áudio do que existe no arquivo:
    // toca direto do buffer, senão a barra permite buscar além do que o elemento
    // alcança e a reprodução para no meio de novo.
    if (bufferDuration > elementDuration + 1 && (await switchToBuffer(position))) return;
    try {
      await target.play();
    } catch {
      if (!(await switchToBuffer(position))) {
        setPhase('error');
        setError('este navegador não reproduz o formato deste áudio');
      }
    }
  }, [mimeType, position, bufferDuration, elementDuration, switchToBuffer]);

  const toggle = useCallback(async () => {
    if (engine === 'buffer') {
      if (playing) {
        const ctx = ctxRef.current;
        const elapsed = ctx ? (ctx.currentTime - startedAtRef.current) * speed : 0;
        const at = offsetRef.current + elapsed;
        stopBufferNode();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        offsetRef.current = at;
        setPosition(at);
        setPlaying(false);
      } else {
        playBuffer(position >= (bufferRef.current?.duration ?? 0) - 0.05 ? 0 : position);
      }
      return;
    }

    if (playing) { audioRef.current?.pause(); return; }

    // Primeiro play: a mídia ainda não foi baixada, então o `<audio>` nem existe.
    // Marca a intenção e deixa o efeito abaixo tocar quando o elemento montar —
    // esperar um frame não serve, porque o commit do React não tem hora marcada.
    if (!objectUrl) {
      pendingPlayRef.current = true;
      if (!(await load())) pendingPlayRef.current = false;
      return;
    }
    await startElementPlayback();
  }, [engine, playing, position, speed, objectUrl, load, playBuffer, stopBufferNode, startElementPlayback]);

  // O elemento é montado no mesmo commit em que `objectUrl` aparece, então quando
  // este efeito roda a ref já está preenchida.
  useEffect(() => {
    if (!objectUrl || !pendingPlayRef.current || engine !== 'element') return;
    pendingPlayRef.current = false;
    void startElementPlayback();
  }, [objectUrl, engine, startElementPlayback]);

  const seek = useCallback((to: number) => {
    const clamped = Math.max(0, Math.min(to, duration || to));
    setPosition(clamped);
    if (engine === 'buffer') {
      if (playing) playBuffer(clamped);
      else offsetRef.current = clamped;
      return;
    }
    const el = audioRef.current;
    if (el) { try { el.currentTime = clamped; } catch { /* fonte ainda não pronta */ } }
  }, [duration, engine, playing, playBuffer]);

  const cycleSpeed = useCallback(() => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as typeof SPEEDS[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    if (engine === 'buffer' && nodeRef.current && playing) {
      const ctx = ctxRef.current!;
      const at = offsetRef.current + (ctx.currentTime - startedAtRef.current) * speed;
      offsetRef.current = at;
      startedAtRef.current = ctx.currentTime;
      nodeRef.current.playbackRate.value = next;
    }
  }, [speed, engine, playing]);

  // --- eventos do elemento ---

  const onLoadedMetadata = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
    // Container sem duração declarada: materializa antes de mostrar a barra. A
    // busca ao fim do arquivo dispara `timeupdate` com valores absurdos, então o
    // relógio da interface fica congelado enquanto isso acontece.
    let reported = el.duration;
    if (!Number.isFinite(reported) || reported <= 0) {
      resolvingRef.current = true;
      reported = await forceDurationResolution(el);
      resolvingRef.current = false;
      setPosition(el.currentTime);
    }
    if (reported > 0) setElementDuration(reported);
    // Duração curta demais para o tamanho do arquivo: o cabeçalho está errado.
    // Decodifica agora para que a barra já nasça com a duração verdadeira, em vez
    // de esperar a reprodução terminar cedo para descobrir isso.
    if (floorDuration > 0 && reported > 0 && reported < floorDuration - 1) await decodeBuffer();
  }, [speed, floorDuration, decodeBuffer]);

  const onEnded = useCallback(async () => {
    const el = audioRef.current;
    const stoppedAt = el?.currentTime ?? 0;
    // Fim antes do esperado = o container terminou cedo. Decodifica o arquivo
    // inteiro e retoma dali; só então aceita que o áudio realmente acabou.
    if (engine === 'element' && expectedDuration > 0 && stoppedAt < expectedDuration - 1) {
      if (await switchToBuffer(stoppedAt)) return;
      setError(`áudio interrompido em ${formatTime(stoppedAt)} de ~${formatTime(expectedDuration)} — arquivo incompleto`);
    }
    setPlaying(false);
    setPosition(duration || stoppedAt);
  }, [engine, expectedDuration, duration, switchToBuffer]);

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const busy = phase === 'loading';
  const canDownload = !!objectUrl;

  return (
    <div className={cn('mb-1 w-64 max-w-full', className)}>
      {objectUrl && engine === 'element' && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          ref={audioRef}
          src={objectUrl}
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={(e) => {
            if (!resolvingRef.current && engineRef.current === 'element') setPosition(e.currentTarget.currentTime);
          }}
          onPlay={() => { if (engineRef.current === 'element') setPlaying(true); }}
          onPause={() => { if (engineRef.current === 'element') setPlaying(false); }}
          onEnded={onEnded}
          onError={() => { setPhase('error'); setError('falha ao decodificar o áudio'); }}
          className="hidden"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60',
            dark ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-primary/10 text-primary hover:bg-primary/20'
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" />
            : playing ? <Pause className="h-4 w-4" />
            : <Play className="h-4 w-4 translate-x-[1px]" />}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.1}
            value={position}
            disabled={duration <= 0}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Posição do áudio"
            className={cn(
              'h-1 w-full cursor-pointer appearance-none rounded-full disabled:cursor-default',
              dark ? 'bg-white/30 accent-white' : 'bg-border accent-primary'
            )}
            style={{
              background: `linear-gradient(to right, currentColor ${progress}%, transparent ${progress}%)`,
            }}
          />
          <div className={cn('mt-1 flex items-center justify-between text-[11px]', muted)}>
            <span>{formatTime(position)}{duration > 0 && ` / ${formatTime(duration)}`}</span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={cycleSpeed} className="font-medium tabular-nums hover:underline" aria-label="Velocidade de reprodução">
                {speed}×
              </button>
              {canDownload && (
                <a
                  href={objectUrl!}
                  download={fileName || 'audio.ogg'}
                  className="hover:underline"
                  aria-label="Baixar áudio"
                  title="Baixar áudio"
                >
                  <Download className="h-3 w-3" />
                </a>
              )}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <p className={cn('mt-1 text-[11px]', muted)}>
          🎤 {error}
          {sizeBytes ? ` · ${formatBytes(sizeBytes)}` : ''}
        </p>
      )}
    </div>
  );
}
