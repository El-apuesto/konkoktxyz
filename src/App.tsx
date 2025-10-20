import { useState } from 'react';
import { Sparkles, Loader2, Image, Mic, Download, Clock } from 'lucide-react';
import { generateImage } from './services/imageService';
import { generateStory } from './services/grokService';

interface Scene {
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  duration: number;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// --- NEW: server-side audio generation ---
async function generateAudioServerSide(text: string, voiceId?: string): Promise<string> {
  const response = await fetch('/api/generateAudio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error || 'Failed to generate audio');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(60);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentStep, setCurrentStep] = useState('');
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [storyTitle, setStoryTitle] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a story prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setScenes([]);
    setVideoBlob(null);
    setStoryTitle('');

    try {
      setCurrentStep('Generating story with AI...');
      const storyData = await generateStory(prompt, duration);
      setStoryTitle(storyData.title);

      const initialScenes: Scene[] = storyData.scenes.map(scene => ({
        text: scene.narration,
        duration: scene.duration,
      }));

      setScenes(initialScenes);

      // --- Image Generation ---
      setCurrentStep(`Generating ${initialScenes.length} images...`);
      for (let i = 0; i < initialScenes.length; i++) {
        try {
          setCurrentStep(`Generating image ${i + 1}/${initialScenes.length}...`);
          const visualPrompt = storyData.scenes[i].visualPrompt || initialScenes[i].text;
          const imageUrl = await generateImage(`${visualPrompt}, cinematic, dark comedy style, high quality`);
          initialScenes[i].imageUrl = imageUrl;
          setScenes([...initialScenes]);
        } catch (err) {
          console.error('Image generation failed:', err);
        }
      }

      // --- Audio Generation via server ---
      setCurrentStep('Generating narration...');
      for (let i = 0; i < initialScenes.length; i++) {
        try {
          setCurrentStep(`Generating audio ${i + 1}/${initialScenes.length}...`);
          const character = storyData.scenes[i].character;
          const voiceId = character ? 'character1' : 'narrator';
          const audioUrl = await generateAudioServerSide(initialScenes[i].text, voiceId);
          initialScenes[i].audioUrl = audioUrl;
          setScenes([...initialScenes]);
        } catch (err) {
          console.error('Audio generation failed:', err);
        }
      }

      // --- Combine audio ---
      setCurrentStep('Assembling audio...');
      const audioSegments = initialScenes.filter(scene => scene.audioUrl).map(scene => scene.audioUrl!);
      let combinedAudioUrl: string;

      if (audioSegments.length > 0) {
        const audioContext = new AudioContext();
        const buffers: AudioBuffer[] = [];

        for (const audioUrl of audioSegments) {
          const response = await fetch(audioUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          buffers.push(audioBuffer);
        }

        const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
        const combinedBuffer = audioContext.createBuffer(2, totalLength, audioContext.sampleRate);

        let offset = 0;
        for (const buffer of buffers) {
          for (let channel = 0; channel < 2; channel++) {
            combinedBuffer.copyToChannel(buffer.getChannelData(channel), channel, offset);
          }
          offset += buffer.length;
        }

        const wavBlob = audioBufferToWav(combinedBuffer);
        combinedAudioUrl = URL.createObjectURL(wavBlob);
      } else {
        throw new Error('No audio segments available');
      }

      // --- Video generation ---
      setCurrentStep('Creating video with Ken Burns effects...');
      const { createVideoWithKenBurns } = await import('./services/videoService');

      const videoScenes = initialScenes
        .filter(scene => scene.imageUrl)
        .map((scene, index) => ({
          imageUrl: scene.imageUrl!,
          duration: scene.duration,
          startTime: initialScenes.slice(0, index).reduce((sum, s) => sum + s.duration, 0),
        }));

      const videoBlob = await createVideoWithKenBurns(
        videoScenes,
        combinedAudioUrl,
        (progress) => {
          setCurrentStep(`Rendering video: ${Math.round(progress)}%`);
        }
      );

      setVideoBlob(videoBlob);
      setCurrentStep('Complete! Video ready to download.');
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayScene = async (scene: Scene) => {
    if (!scene.audioUrl) return;
    try {
      const audio = new Audio(scene.audioUrl);
      await audio.play();
    } catch (err) {
      console.error('Audio playback failed:', err);
    }
  };

  const handleDownload = () => {
    if (!videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storyTitle.replace(/[^a-z0-9]/gi, '_')}_video.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Your full UI code remains the same */}
    </div>
  );
}