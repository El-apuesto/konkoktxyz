import { useState } from 'react';
import { Sparkles, Loader2, Image, Mic, Download, Clock } from 'lucide-react';
import { generateImage } from './services/imageGenerator';
import { generateStory } from './services/storyGenerator'; // updated import

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

      setCurrentStep('Assembling video with Ken Burns effects...');
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
        null, // audio disabled for now
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
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <header className="text-center mb-16">
          <img
            src="/C24E50A7-872B-4557-A884-2387165237FD.png"
            alt="Logo"
            className="h-48 w-auto mx-auto mb-4"
          />
          <p className="text-slate-400 text-lg">Dark Comedy Story Videos</p>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., clumsy detective, lazy superhero, nervous vampire"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              rows={4}
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 mt-4"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Story
                </>
              )}
            </button>

            {currentStep && (
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-700 mt-4">
                <div className="flex items-center gap-3">
                  {isGenerating && <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />}
                  <p className="text-slate-300 text-sm">{currentStep}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
            {scenes.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                <p>Your story scenes will appear here</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {scenes.map((scene, index) => (
                  <div key={index} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                    {scene.imageUrl && (
                      <img
                        src={scene.imageUrl}
                        alt={`Scene ${index + 1}`}
                        className="w-full rounded-lg mb-3"
                      />
                    )}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-300 text-sm leading-relaxed mb-2">{scene.text}</p>
                        <span className="text-slate-500