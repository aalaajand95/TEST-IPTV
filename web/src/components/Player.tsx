import type Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface Props {
  playId: string;
  poster?: string;
  live?: boolean;
  resumeAt?: number;
  onProgress?: (position: number, duration: number) => void;
  onEnded?: () => void;
}

/**
 * HLS via hls.js (native on Safari/iOS), progressive files via <video>. When the direct URL fails
 * (CORS, http stream on an https page, provider blocking browsers) it retries through the server proxy.
 */
export function Player({ playId, poster, live, resumeAt, onProgress, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { t } = useI18n();
  const progressCb = useRef(onProgress);
  const endedCb = useRef(onEnded);
  progressCb.current = onProgress;
  endedCb.current = onEnded;

  useEffect(() => {
    const video = videoRef.current!;
    let hls: Hls | null = null;
    let cancelled = false;
    setError(null);

    const attach = async (url: string, type: 'hls' | 'file', onFail: () => void) => {
      hls?.destroy();
      hls = null;
      video.onerror = null;
      // Safari/iOS play HLS natively; everyone else gets hls.js, loaded only when needed.
      const native = video.canPlayType('application/vnd.apple.mpegurl') !== '';
      const HlsLib = type === 'hls' && !native ? (await import('hls.js')).default : null;
      if (cancelled) return;
      if (HlsLib?.isSupported()) {
        const instance = new HlsLib({ lowLatencyMode: !!live, backBufferLength: live ? 30 : 90 });
        hls = instance;
        instance.on(HlsLib.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) return instance.recoverMediaError();
          onFail();
        });
        instance.loadSource(url);
        instance.attachMedia(video);
      } else {
        video.src = url;
        video.onerror = onFail;
      }
      if (resumeAt && !live) {
        video.addEventListener('loadedmetadata', () => (video.currentTime = resumeAt), { once: true });
      }
      video.play().catch(() => {
        // Autoplay with sound can be blocked; the controls are still there.
      });
    };

    api.play(playId).then(
      (s) => {
        if (cancelled) return;
        const fail = () => !cancelled && setError('');
        void attach(s.url, s.type, s.fallbackUrl ? () => void (!cancelled && attach(s.fallbackUrl!, s.type, fail)) : fail);
      },
      (e: Error) => !cancelled && setError(e.message),
    );

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [playId, live, resumeAt, attempt]);

  useEffect(() => {
    if (live) return;
    const video = videoRef.current!;
    let last = 0;
    const tick = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      const now = Date.now();
      if (now - last < 10_000) return;
      last = now;
      progressCb.current?.(video.currentTime, video.duration);
    };
    const pause = () => video.duration && progressCb.current?.(video.currentTime, video.duration);
    const ended = () => {
      pause();
      endedCb.current?.();
    };
    video.addEventListener('timeupdate', tick);
    video.addEventListener('pause', pause);
    video.addEventListener('ended', ended);
    return () => {
      pause();
      video.removeEventListener('timeupdate', tick);
      video.removeEventListener('pause', pause);
      video.removeEventListener('ended', ended);
    };
  }, [live, playId]);

  return (
    <div className="player">
      <video ref={videoRef} controls playsInline poster={poster} />
      {error !== null && (
        <div className="player-error" role="alert">
          <p>{error || t('streamError')}</p>
          <button className="btn" onClick={() => setAttempt((a) => a + 1)}>{t('retry')}</button>
        </div>
      )}
    </div>
  );
}
