import React, { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import Player from './components/Player';
import Playlist from './components/Playlist';
import { Upload, Shuffle, Settings, Volume2, FileAudio } from 'lucide-react';

interface Track {
  id: string; // Unique identifier for each track
  url: string;
  name: string;
  priority: number;
}

function App() {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  // State for sorting and last played track
  const [sortOrder, setSortOrder] = useState<'recent' | 'added'>('added');
  const [recentHistory, setRecentHistory] = useState<string[]>([]);
  const [isShuffleOn, setIsShuffleOn] = useState(true);

  // Initialize loopCount from localStorage or default to 2
  const [loopCount, setLoopCount] = useState(() => {
    const saved = localStorage.getItem('loopCount');
    return saved ? Number(saved) : 2;
  });

  // Initialize playbackSpeeds from localStorage or default
  const [playbackSpeeds, setPlaybackSpeeds] = useState<number[]>(() => {
    const saved = localStorage.getItem('playbackSpeeds');
    return saved ? JSON.parse(saved) : [1.0, 1.1, 1.2];
  });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for Height Matching
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const [playlistHeight, setPlaylistHeight] = useState<number | undefined>(undefined);

  // Measure Left Column Height
  useLayoutEffect(() => {
    const updateHeight = () => {
      if (leftColumnRef.current) {
        setPlaylistHeight(leftColumnRef.current.offsetHeight);
      }
    };

    // Update initially and when loopCount changes (as it changes settings height)
    updateHeight();
    
    // Add resize listener
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [loopCount, playlist.length]); // Re-measure when content changes

  // Helper to add to history
  const addToHistory = useCallback((trackId: string) => {
      setRecentHistory(prev => {
          const newHistory = [trackId, ...prev.filter(id => id !== trackId)];
          return newHistory.slice(0, 50); // Keep last 50
      });
  }, []);

  // Save loopCount to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('loopCount', loopCount.toString());
  }, [loopCount]);

  // Save playbackSpeeds to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('playbackSpeeds', JSON.stringify(playbackSpeeds));
  }, [playbackSpeeds]);

  const addFilesToPlaylist = (files: FileList | File[]) => {
    const newTracks: Track[] = Array.from(files)
      .filter(file => file.type.startsWith('audio/'))
      .map(file => ({
        id: crypto.randomUUID(), // Generate unique ID
        url: URL.createObjectURL(file),
        name: file.name,
        priority: 2, // Default to Medium (2)
      }));
    setPlaylist(prev => [...prev, ...newTracks]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      addFilesToPlaylist(files);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFilesToPlaylist(files);
    }
  }, []);

  // Helper to pick next track based on weights
  const pickNextWeightedTrack = useCallback((currentId: string | null) => {
      if (playlist.length === 0) return 0;
      if (playlist.length === 1) return 0;

      // Filter out current track to avoid immediate repeat (unless only 1 track)
      const candidates = playlist.filter(t => t.id !== currentId);
      
      // Calculate total weight
      const getWeight = (p: number) => {
          switch(p) {
              case 3: return 9;
              case 2: return 3;
              case 1: return 1;
              default: return 3;
          }
      };

      const totalWeight = candidates.reduce((sum, track) => sum + getWeight(track.priority), 0);
      let randomValue = Math.random() * totalWeight;
      
      // Select track
      let selectedTrack = candidates[0];
      for (const track of candidates) {
          randomValue -= getWeight(track.priority);
          if (randomValue <= 0) {
              selectedTrack = track;
              break;
          }
      }

      // Return the index of the selected track in the MAIN playlist
      return playlist.findIndex(t => t.id === selectedTrack.id);
  }, [playlist]);


  const handleTrackEnd = useCallback(() => {
    if (playlist.length === 0) return;
    
    const currentId = playlist[currentTrackIndex]?.id;
    if (currentId) addToHistory(currentId);

    if (isShuffleOn) {
        const nextIndex = pickNextWeightedTrack(currentId);
        setCurrentTrackIndex(nextIndex);
    } else {
        // Sequential order (wrapping)
        setCurrentTrackIndex(prevIndex => (prevIndex + 1) % playlist.length);
    }
  }, [playlist, currentTrackIndex, isShuffleOn, pickNextWeightedTrack, addToHistory]);

  const handleTrackSelect = useCallback((index: number) => {
    // Record current track
    const trackId = playlist[index]?.id;
    if (trackId) addToHistory(trackId);
    
    setCurrentTrackIndex(index);
  }, [playlist, addToHistory]);
  
  const handleNextTrack = useCallback(() => {
      if (playlist.length > 0) {
           const currentId = playlist[currentTrackIndex]?.id;
           if (currentId) addToHistory(currentId);
           
           if (isShuffleOn) {
               const nextIndex = pickNextWeightedTrack(currentId);
               setCurrentTrackIndex(nextIndex);
           } else {
               setCurrentTrackIndex(prev => (prev + 1) % playlist.length);
           }
      }
  }, [playlist, currentTrackIndex, isShuffleOn, pickNextWeightedTrack, addToHistory]);

  const handlePreviousTrack = useCallback(() => {
      if (playlist.length > 0) {
           const currentId = playlist[currentTrackIndex]?.id;
           if (currentId) addToHistory(currentId);

           setCurrentTrackIndex(prev => (prev - 1 + playlist.length) % playlist.length);
      }
  }, [playlist, currentTrackIndex, addToHistory]);

  const handleRemoveTrack = useCallback((idToRemove: string) => {
    // 1. Capture current track ID
    const currentTrackId = playlist[currentTrackIndex]?.id;

    setPlaylist(prev => {
        const newPlaylist = prev.filter(t => t.id !== idToRemove);
        
        // 2. If we removed the currently playing track
        if (idToRemove === currentTrackId) {
            if (newPlaylist.length === 0) {
                setCurrentTrackIndex(0);
            } else {
                // Determine new index (try to stay at same visual position, or go to 0)
                // If we were at index 5, and it's gone, index 5 is now the next song.
                // We just need to clamp it.
                setCurrentTrackIndex(prevIndex => Math.min(prevIndex, newPlaylist.length - 1));
            }
        } 
        // 3. If we removed a DIFFERENT track
        else {
            // Find where our playing track moved to
            const newIndex = newPlaylist.findIndex(t => t.id === currentTrackId);
            if (newIndex !== -1) {
                setCurrentTrackIndex(newIndex);
            }
        }
        return newPlaylist;
    });
  }, [playlist, currentTrackIndex]);

  const handlePriorityChange = useCallback((id: string, newPriority: number) => {
      setPlaylist(prev => {
          return prev.map(track => 
              track.id === id ? { ...track, priority: newPriority } : track
          );
      });
  }, []);

  const handleLoopCountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLoopCount(Number(event.target.value));
  };

  const handleSpeedChange = (index: number, value: number) => {
    setPlaybackSpeeds(prev => {
      const newSpeeds = [...prev];
      newSpeeds[index] = value;
      return newSpeeds;
    });
  };

  const toggleShuffle = useCallback(() => {
      setIsShuffleOn(prev => !prev);
  }, []);

  // Memoized sorted playlist for rendering
  const sortedPlaylist = useMemo(() => {
    if (sortOrder === 'recent' && recentHistory.length > 0) {
      // Create a map for O(1) history lookup
      const historyMap = new Map(recentHistory.map((id, index) => [id, index]));
      
      // Sort the playlist: history tracks first, in order of recency, then other tracks
      const sorted = [...playlist].sort((a, b) => {
          const indexA = historyMap.has(a.id) ? historyMap.get(a.id)! : Infinity;
          const indexB = historyMap.has(b.id) ? historyMap.get(b.id)! : Infinity;
          
          return indexA - indexB; // Lower index (more recent) comes first
      });
      return sorted;
    }
    return playlist; // Default 'added' order
  }, [playlist, sortOrder, recentHistory]);

  // Adjust currentTrackIndex based on the sorted view for the Playlist component highlighting
  const currentTrackIndexInSorted = useMemo(() => {
    const currentTrack = playlist[currentTrackIndex];
    if (!currentTrack) return 0;
    return sortedPlaylist.findIndex(track => track.id === currentTrack.id);
  }, [playlist, currentTrackIndex, sortedPlaylist]);

  // When selecting from Sorted Playlist, we get an index in the SORTED list.
  const handleSortedTrackSelect = useCallback((sortedIndex: number) => {
      const selectedTrack = sortedPlaylist[sortedIndex];
      const mainIndex = playlist.findIndex(t => t.id === selectedTrack.id);
      handleTrackSelect(mainIndex);
  }, [sortedPlaylist, playlist, handleTrackSelect]);


  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-gray-100 font-sans selection:bg-blue-500/30 relative flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-600/20 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none">
          <FileAudio size={80} className="text-blue-400 mb-4 animate-bounce" />
          <h2 className="text-3xl font-bold text-white drop-shadow-md">Drop Audio Files Here</h2>
        </div>
      )}

      {/* Header */}
      <header className="p-6 border-b border-white/5 bg-black/20 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
                <Volume2 className="text-indigo-400" /> 
                Audio Player
            </h1>
            
            <div className="flex gap-3">
                <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95 text-sm"
                >
                <Upload size={16} /> Add Files
                </button>
                <input
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
                ref={fileInputRef}
                />
            </div>
          </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 md:p-8 w-full flex-grow">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Player & Settings */}
          <div className="lg:col-span-7 flex flex-col space-y-6" ref={leftColumnRef}>
             {/* Player Card */}
             {playlist.length > 0 ? (
                <Player
                playlist={playlist}
                currentTrackIndex={currentTrackIndex}
                onTrackEnd={handleTrackEnd}
                playbackSpeeds={playbackSpeeds}
                loopCount={loopCount}
                onNextTrack={handleNextTrack}
                onPreviousTrack={handlePreviousTrack}
                isShuffleOn={isShuffleOn}
                onToggleShuffle={toggleShuffle}
                />
            ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center text-gray-500 flex flex-col items-center justify-center min-h-[300px]">
                    <Upload size={48} className="mb-4 opacity-50"/>
                    <h3 className="text-xl font-semibold mb-2 text-gray-300">Start Your Session</h3>
                    <p>Add audio files to begin practicing.</p>
                </div>
            )}

            {/* Settings Panel */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl shadow-lg">
                <div className="flex items-center gap-2 mb-6 text-gray-300 border-b border-white/5 pb-4">
                    <Settings size={20} className="text-indigo-400" />
                    <h3 className="font-semibold">Playback Configuration</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Loop Count */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Loops per Track</label>
                        <select
                            id="loop-count"
                            value={loopCount}
                            onChange={handleLoopCountChange}
                            className="w-full bg-black/30 border border-white/10 text-white p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer hover:bg-black/40"
                        >
                            <option value={1}>1 Play (No Repeat)</option>
                            <option value={2}>2 Plays (Loop Once)</option>
                            <option value={3}>3 Plays (Loop Twice)</option>
                        </select>
                    </div>

                    {/* Speeds */}
                    <div className="md:col-span-2 space-y-4">
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Adaptive Speed Control</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {Array.from({ length: loopCount }).map((_, i) => (
                                <div key={i} className="bg-black/20 p-4 rounded-xl border border-white/5 relative group">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xs font-bold text-indigo-300">PASS {i + 1}</span>
                                        <span className="text-sm font-mono text-white bg-indigo-500/20 px-2 py-0.5 rounded">
                                            {(playbackSpeeds[i] || 1.0).toFixed(2)}x
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.05"
                                        value={playbackSpeeds[i] || 1.0}
                                        onChange={(e) => handleSpeedChange(i, Number(e.target.value))}
                                        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
          </div>

          {/* Right Column: Playlist */}
          <div 
            className="lg:col-span-5 flex flex-col lg:sticky lg:top-24"
            style={{ height: playlistHeight ? `${playlistHeight}px` : 'auto' }}
          >
             <Playlist
                playlist={sortedPlaylist} 
                currentTrackIndex={currentTrackIndexInSorted}
                onTrackSelect={handleSortedTrackSelect}
                onRemoveTrack={handleRemoveTrack}
                onPriorityChange={handlePriorityChange}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;