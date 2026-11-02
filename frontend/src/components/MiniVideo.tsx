"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  Expand, ListVideo, Minimize2, Pause, PictureInPicture2, Play, Video, Volume2, VolumeX,
} from "lucide-react";

const COLLAPSED_KEY = "varanasi-dashboard-video-collapsed";

export interface VideoItem {
  src: string;
  poster?: string;
  title: string;
  /** Who made / published the footage, shown under the player. */
  source: string;
  /** Length in seconds, shown in the playlist before the file has loaded. */
  durationSec: number;
  caption?: string;
  /** Repeat this video instead of moving on to the next one. */
  loop?: boolean;
  hasAudio?: boolean;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Compact video card with its own controls and a playlist. The first video autoplays muted (unless the viewer
 *  prefers reduced motion); playback pauses while scrolled out of view, and the card can be collapsed to a bar. */
export default function MiniVideo({ videos, children }: { videos: VideoItem[]; children?: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  // Paused by the viewer: don't restart it when it scrolls back into view.
  const userPaused = useRef(false);
  // Start the next video as soon as it loads (after a playlist click or when the previous one ends).
  const autoStart = useRef(false);
  const item = videos[index];
  const canPip = typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) userPaused.current = true;
  }, []);

  // Play only while visible on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || collapsed) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !userPaused.current) video.play().catch(() => {});
      else if (!entry.isIntersecting && document.pictureInPictureElement !== video) video.pause();
    }, { threshold: 0.4 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [collapsed]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      video.play().catch(() => {});
    } else {
      userPaused.current = true;
      video.pause();
    }
  }

  function select(i: number) {
    if (i === index) return toggle();
    userPaused.current = false;
    autoStart.current = true;
    setTime(0);
    setDuration(0);
    setIndex(i);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.paused) toggle();
  }

  function seek(e: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    video.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration;
  }

  function seekKey(e: KeyboardEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video) return;
    const step = Math.max(1, duration / 20);
    const delta = { ArrowLeft: -step, ArrowRight: step, Home: -duration, End: duration }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    video.currentTime = Math.min(duration, Math.max(0, video.currentTime + delta));
  }

  function setCollapsedSaved(value: boolean) {
    setCollapsed(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
    } catch {}
  }

  async function pip() {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture().catch(() => {});
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else frameRef.current?.requestFullscreen().catch(() => {});
  }

  if (collapsed) {
    return (
      <button type="button" className="mini-player collapsed" onClick={() => setCollapsedSaved(false)}>
        <Video size={16} /> <span>Show videos ({videos.length})</span>
      </button>
    );
  }

  const progress = duration ? (time / duration) * 100 : 0;
  return (
    <section className="mini-player" aria-label="Videos">
      <header className="mini-head">
        <span className="mini-title"><Video size={16} /> {item.title}</span>
        <button type="button" className="mini-icon" onClick={() => setCollapsedSaved(true)} aria-label="Minimise video" title="Minimise">
          <Minimize2 size={15} />
        </button>
      </header>
      <div className={`mini-frame ${playing ? "playing" : ""}`} ref={frameRef}>
        <video
          key={item.src}
          ref={videoRef}
          src={encodeURI(item.src)}
          poster={item.poster}
          muted={muted}
          loop={item.loop}
          playsInline
          preload="metadata"
          aria-label={item.title}
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (autoStart.current) {
              autoStart.current = false;
              e.currentTarget.play().catch(() => {});
            }
          }}
          onEnded={() => select((index + 1) % videos.length)}
        />
        {!playing && (
          <button type="button" className="mini-big-play" onClick={toggle} aria-label="Play video">
            <Play size={26} fill="currentColor" />
          </button>
        )}
        {item.hasAudio && muted && playing && (
          <button type="button" className="mini-sound-hint" onClick={toggleMute}>
            <VolumeX size={14} /> Tap for sound
          </button>
        )}
        <div className="mini-controls">
          <button type="button" className="mini-icon" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <div
            className="mini-progress"
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${clock(time)} of ${clock(duration || item.durationSec)}`}
            onPointerDown={seek}
            onKeyDown={seekKey}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="mini-time">{clock(time)} / {clock(duration || item.durationSec)}</span>
          {item.hasAudio && (
            <button type="button" className="mini-icon" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
          {canPip && (
            <button type="button" className="mini-icon" onClick={pip} aria-label="Picture in picture" title="Picture in picture">
              <PictureInPicture2 size={16} />
            </button>
          )}
          <button type="button" className="mini-icon" onClick={fullscreen} aria-label="Full screen" title="Full screen">
            <Expand size={15} />
          </button>
        </div>
      </div>
      <p className="mini-source">Source: {item.source} · {clock(duration || item.durationSec)}</p>
      {item.caption && <p className="mini-caption">{item.caption}</p>}

      {videos.length > 1 && (
        <div className="mini-playlist">
          <span className="mini-playlist-head"><ListVideo size={14} /> Playlist · {videos.length} videos</span>
          <ol>
            {videos.map((v, i) => (
              <li key={v.src}>
                <button type="button" className={`mini-track ${i === index ? "current" : ""}`} onClick={() => select(i)}
                  aria-current={i === index ? "true" : undefined}>
                  <span className="mini-thumb" style={v.poster ? { backgroundImage: `url(${v.poster})` } : undefined}>
                    <span className="mini-thumb-time">{clock(v.durationSec)}</span>
                    {i === index && playing && <span className="mini-eq" aria-hidden><i /><i /><i /></span>}
                  </span>
                  <span className="mini-track-text">
                    <b>{v.title}</b>
                    <small>{v.source}</small>
                    <small>{i === index ? (playing ? "Now playing" : "Paused") : `${clock(v.durationSec)}${v.hasAudio ? " · with sound" : ""}`}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {children}
    </section>
  );
}
