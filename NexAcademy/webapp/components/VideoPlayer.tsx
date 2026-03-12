"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Languages,
} from "lucide-react";

interface VideoSource {
  url: string;
  language: string;
  label: string;
}

interface VideoPlayerProps {
  videos: VideoSource[];
  onWatchedChange?: (watched: boolean, percentage: number) => void;
}

export default function VideoPlayer({
  videos,
  onWatchedChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [watchedSegments, setWatchedSegments] = useState<Set<number>>(
    new Set()
  );
  const [watchedPercentage, setWatchedPercentage] = useState(0);
  const [isWatched, setIsWatched] = useState(false);

  useEffect(() => {
    if (watchedPercentage) {
    }
  });
  // Use ref to avoid stale closures in event handlers
  const watchedSegmentsRef = useRef<Set<number>>(new Set());
  const isWatchedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    watchedSegmentsRef.current = watchedSegments;
    isWatchedRef.current = isWatched;
  }, [watchedSegments, isWatched]);

  // Handle video metadata loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(video.currentTime);

        // Track watched segments (in 1-second intervals)
        const segment = Math.floor(video.currentTime);
        if (!watchedSegmentsRef.current.has(segment) && video.duration > 0) {
          const newWatchedSegments = new Set(watchedSegmentsRef.current);
          newWatchedSegments.add(segment);
          setWatchedSegments(newWatchedSegments);

          // Calculate watched percentage
          const totalSegments = Math.floor(video.duration);
          const percentage = (newWatchedSegments.size / totalSegments) * 100;
          setWatchedPercentage(percentage);

          // Check if 50% threshold is reached
          if (percentage >= 50 && !isWatchedRef.current) {
            setIsWatched(true);
            onWatchedChange?.(true, percentage);
          } else {
            onWatchedChange?.(isWatchedRef.current, percentage);
          }
        }
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percentage = (bufferedEnd / video.duration) * 100;
        setBuffered(percentage);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handleEnded);
    };
  }, [isSeeking, onWatchedChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(duration, video.currentTime + 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((prev) => Math.min(1, prev + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((prev) => Math.max(0, prev - 0.1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duration]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Auto-hide controls
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  // Update video volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      setVolume(video.volume || 0.5);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Error toggling fullscreen:", error);
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progressBar = progressBarRef.current;
    if (!video || !progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
    setCurrentTime(pos * duration);
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsSeeking(true);
    handleProgressBarClick(e);
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSeeking) {
      handleProgressBarClick(e);
    }
  };

  const handleProgressBarMouseUp = () => {
    setIsSeeking(false);
  };

  const handleVolumeBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const volumeBar = volumeBarRef.current;
    if (!volumeBar) return;

    const rect = volumeBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newVolume = Math.max(0, Math.min(1, pos));
    setVolume(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
      if (videoRef.current) videoRef.current.muted = false;
    }
  };

  const switchLanguage = (index: number) => {
    const video = videoRef.current;
    if (!video) return;

    const wasPlaying = isPlaying;
    const currentTimeStamp = video.currentTime;

    setCurrentVideoIndex(index);
    setShowLanguageMenu(false);

    // Wait for video to load and restore playback state
    setTimeout(() => {
      if (video) {
        video.currentTime = currentTimeStamp;
        if (wasPlaying) {
          video.play();
        }
      }
    }, 100);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleVideoClick = () => {
    togglePlay();
  };

  // Touch gestures for mobile
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    resetControlsTimeout();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Detect tap (minimal movement)
    if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
      togglePlay();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-5xl mx-auto bg-black rounded-lg overflow-hidden shadow-2xl"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-auto cursor-pointer"
        src={videos[currentVideoIndex]?.url}
        onClick={handleVideoClick}
        playsInline
      />

      {/* Center Play Button Overlay */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-20 h-20 md:w-24 md:h-24 bg-white/90 hover:bg-white rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110 shadow-lg">
            <Play className="w-10 h-10 md:w-12 md:h-12 text-black ml-1" />
          </div>
        </div>
      )}

      {/* Controls Container */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-4 md:p-6 transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Progress Bar */}
        <div
          ref={progressBarRef}
          className="relative w-full h-1 md:h-1.5 bg-white/30 rounded-full cursor-pointer mb-4 group"
          onClick={handleProgressBarClick}
          onMouseDown={handleProgressBarMouseDown}
          onMouseMove={handleProgressBarMouseMove}
          onMouseUp={handleProgressBarMouseUp}
          onMouseLeave={handleProgressBarMouseUp}
        >
          {/* Buffered Progress */}
          <div
            className="absolute top-0 left-0 h-full bg-white/40 rounded-full transition-all"
            style={{ width: `${buffered}%` }}
          />
          {/* Current Progress */}
          <div
            className="absolute top-0 left-0 h-full bg-white rounded-full transition-all"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          {/* Progress Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              left: `${(currentTime / duration) * 100}%`,
              marginLeft: "-6px",
            }}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-2 md:gap-4">
          {/* Left Controls */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="text-white hover:scale-110 transition-transform"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 md:w-7 md:h-7" />
              ) : (
                <Play className="w-6 h-6 md:w-7 md:h-7" />
              )}
            </button>

            {/* Volume Controls */}
            <div className="flex items-center gap-2 group">
              <button
                onClick={toggleMute}
                className="text-white hover:scale-110 transition-transform"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 md:w-6 md:h-6" />
                ) : (
                  <Volume2 className="w-5 h-5 md:w-6 md:h-6" />
                )}
              </button>
              {/* Volume Slider */}
              <div className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity">
                <div
                  ref={volumeBarRef}
                  className="relative w-20 h-1 bg-white/30 rounded-full cursor-pointer"
                  onClick={handleVolumeBarClick}
                >
                  <div
                    className="absolute top-0 left-0 h-full bg-white rounded-full"
                    style={{ width: `${volume * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Time Display */}
            <div className="text-white text-xs md:text-sm font-semibold">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Language Selector */}
            {videos.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                  className="text-white hover:scale-110 transition-transform flex items-center gap-1 px-2 py-1 rounded hover:bg-white/20"
                  aria-label="Change language"
                >
                  <Languages className="w-5 h-5 md:w-6 md:h-6" />
                  <span className="hidden md:inline text-sm">
                    {videos[currentVideoIndex]?.label}
                  </span>
                </button>
                {showLanguageMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg shadow-xl overflow-hidden min-w-[120px] md:min-w-[150px]">
                    {videos.map((video, index) => (
                      <button
                        key={index}
                        onClick={() => switchLanguage(index)}
                        className={`w-full text-left px-4 py-2 md:py-3 text-sm md:text-base hover:bg-white/20 transition-colors ${
                          index === currentVideoIndex
                            ? "bg-white/10 text-white font-semibold"
                            : "text-white/80"
                        }`}
                      >
                        {video.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:scale-110 transition-transform"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5 md:w-6 md:h-6" />
              ) : (
                <Maximize className="w-5 h-5 md:w-6 md:h-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
