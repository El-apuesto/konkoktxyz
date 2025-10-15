import { useState, useEffect } from 'react';
import { Sparkles, Upload, Play, Download, Loader2, Clock, Mic, Settings, Library, Crown } from 'lucide-react';
import { supabase } from './lib/supabase';
import { generateStory, generateImagePrompts } from './services/grokService';
import { generateImage } from './services/imageService';
import { createAudioFromScenes, getAvailableVoices, VoiceConfig } from './services/audioService';
import { createVideoWithKenBurns, downloadVideo, VideoScene } from './services/videoService';
import { AnimationProvider, getAvailableProviders, animateImage } from './services/animationService';
import { uploadVideo, getUserVideos, deleteVideo } from './services/storageService';

type DurationOption = 60 | 180 | 300;

interface GenerationStep {
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  message?: string;
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [uploadedScript, setUploadedScript] = useState('');
  const [duration, setDuration] = useState<DurationOption>(60);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [voices, setVoices] = useState<VoiceConfig[]>([]);
  const [characterVoices, setCharacterVoices] = useState<Map<string, string>>(new Map());
  const [narratorVoice, setNarratorVoice] = useState<string>('Claribel Dervla');
  const [animationProvider, setAnimationProvider] = useState<AnimationProvider>('ken-burns');
  const [showSettings, setShowSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [savedVideos, setSavedVideos] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadVoices = async () => {
      const availableVoices = await getAvailableVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0) {
        setNarratorVoice(availableVoices[0].id);
      }
    };
    loadVoices();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    const currentMonth = new Date().toISOString().slice(0, 7);

    const { data: subData } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: usageData } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', currentMonth)
      .maybeSingle();

    const videos = await getUserVideos(user.id);

    setSubscription(subData || { plan_tier: 'free', status: 'active' });
    setUsage(usageData || { videos_generated: 0 });
    setSavedVideos(videos);
  };

  const updateStep = (name: string, status: GenerationStep['status'], message?: string) => {
    setGenerationSteps(prev => {
      const existing = prev.find(s => s.name === name);
      if (existing) {
        return prev.map(s => s.name === name ? { ...s, status, message } : s);
      }
      return [...prev, { name, status, message }];
    });
  };

  const handleGenerate = async () => {
    if (!prompt && !uploadedScript) {
      alert('Please enter a prompt or upload a script');
      return;
    }

    if (user) {
      const { data: canGenerate } = await supabase.rpc('can_generate_video', { p_user_id: user.id });
      if (!canGenerate) {
        alert('You have reached your monthly video limit. Please upgrade your plan.');
        return;
      }
    }

    setIsGenerating(true);
    setGenerationSteps([]);
    setProgress(0);
    setVideoUrl(null);
    setVideoBlob(null);

    try {
      updateStep('Generating story', 'in-progress');

      let storyData: any;
      if (uploadedScript) {
        const imagePrompts = await generateImagePrompts(uploadedScript, [], duration);
        storyData = {
          title: 'Custom Story',
          script: uploadedScript,
          characters: [],
          scenes: imagePrompts.map((img: any, i: number) => ({
            narration: uploadedScript.split('\n\n')[i] || uploadedScript.substring(i * 100, (i + 1) * 100),
            visualPrompt: img.prompt,
            duration: img.timestampEnd - img.timestampStart
          }))
        };
      } else {
        storyData = await generateStory(prompt, duration);
      }

      updateStep('Generating story', 'completed', `Created "${storyData.title}"`);

      if (storyData.characters.length > 0) {
        const newCharacterVoices = new Map<string, string>();
        const maleVoices = voices.filter(v => v.gender === 'male');
        const femaleVoices = voices.filter(v => v.gender === 'female');

        storyData.characters.forEach((char: any, index: number) => {
          const voicePool = char.voice === 'male' ? maleVoices : femaleVoices;
          const assignedVoice = voicePool[index % voicePool.length];
          if (assignedVoice) {
            newCharacterVoices.set(char.name, assignedVoice.id);
          }
        });

        setCharacterVoices(newCharacterVoices);
      }

      const storyRecord = user ? await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          title: storyData.title,
          prompt: prompt || 'Custom script',
          script: storyData.script,
          duration: duration,
          status: 'generating'
        })
        .select()
        .maybeSingle() : null;

      if (user && storyRecord?.data) {
        await supabase.from('characters').insert(
          storyData.characters.map((char: any) => ({
            story_id: storyRecord.data.id,
            name: char.name,
            description: char.description
          }))
        );
      }

      updateStep('Generating images', 'in-progress', `0/${storyData.scenes.length}`);

      const images: string[] = [];
      for (let i = 0; i < storyData.scenes.length; i++) {
        const scene = storyData.scenes[i];
        try {
          const imageUrl = await generateImage(scene.visualPrompt);
          images.push(imageUrl);
          updateStep('Generating images', 'in-progress', `${i + 1}/${storyData.scenes.length}`);
        } catch (error) {
          console.error(`Error generating image ${i}:`, error);
          const placeholderCanvas = document.createElement('canvas');
          placeholderCanvas.width = 1080;
          placeholderCanvas.height = 1920;
          const ctx = placeholderCanvas.getContext('2d')!;
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, 1080, 1920);
          ctx.fillStyle = '#ffffff';
          ctx.font = '48px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Scene ' + (i + 1), 540, 960);
          images.push(placeholderCanvas.toDataURL());
        }
      }

      updateStep('Generating images', 'completed', `${images.length} images created`);

      if (user && storyRecord?.data) {
        let currentTime = 0;
        await supabase.from('image_prompts').insert(
          storyData.scenes.map((scene: any, i: number) => {
            const start = currentTime;
            currentTime += scene.duration;
            return {
              story_id: storyRecord.data.id,
              sequence: i,
              prompt: scene.visualPrompt,
              image_url: images[i],
              timestamp_start: start,
              timestamp_end: currentTime
            };
          })
        );
      }

      updateStep('Generating narration', 'in-progress');

      const audioUrl = await createAudioFromScenes(
        storyData.scenes.map((s: any) => ({
          narration: s.narration,
          duration: s.duration,
          character: s.character
        })),
        narratorVoice,
        characterVoices
      );

      updateStep('Generating narration', 'completed');

      updateStep('Creating video', 'in-progress');

      let videoBlob: Blob | undefined;

      if (animationProvider === 'ken-burns') {
        const videoScenes: VideoScene[] = storyData.scenes.map((scene: any, i: number) => {
          const startTime = storyData.scenes.slice(0, i).reduce((sum: number, s: any) => sum + s.duration, 0);
          return {
            imageUrl: images[i],
            duration: scene.duration,
            startTime
          };
        });

        videoBlob = await createVideoWithKenBurns(videoScenes, audioUrl, (prog) => {
          setProgress(prog);
        });
      } else {
        updateStep('Animating scenes', 'in-progress');
        const animatedScenes: Blob[] = [];

        for (let i = 0; i < images.length; i++) {
          try {
            const animatedClip = await animateImage({
              provider: animationProvider,
              imageUrl: images[i],
              duration: storyData.scenes[i].duration,
              prompt: storyData.scenes[i].visualPrompt
            });
            animatedScenes.push(animatedClip);
            updateStep('Animating scenes', 'in-progress', `${i + 1}/${images.length}`);
          } catch (error) {
            console.error(`Animation failed for scene ${i}:`, error);
            alert(`Animation provider ${animationProvider} failed. Falling back to Ken Burns effect.`);
            const videoScenes: VideoScene[] = storyData.scenes.map((scene: any, j: number) => {
              const startTime = storyData.scenes.slice(0, j).reduce((sum: number, s: any) => sum + s.duration, 0);
              return {
                imageUrl: images[j],
                duration: scene.duration,
                startTime
              };
            });
            videoBlob = await createVideoWithKenBurns(videoScenes, audioUrl, (prog) => setProgress(prog));
            break;
          }
        }

        if (animatedScenes.length === images.length) {
          updateStep('Animating scenes', 'completed');
          updateStep('Merging video', 'in-progress');
          videoBlob = new Blob(animatedScenes, { type: 'video/mp4' });
        }
      }

      updateStep('Creating video', 'completed');

      if (!videoBlob) {
        throw new Error('Video generation failed');
      }

      const videoObjectUrl = URL.createObjectURL(videoBlob);
      setVideoUrl(videoObjectUrl);
      setVideoBlob(videoBlob);

      if (user && storyRecord?.data) {
        updateStep('Saving video', 'in-progress');
        const publicUrl = await uploadVideo(videoBlob, user.id, storyRecord.data.id);

        await supabase
          .from('stories')
          .update({ status: 'completed', video_url: publicUrl })
          .eq('id', storyRecord.data.id);

        updateStep('Saving video', 'completed');
        await loadUserData();
      }

    } catch (error) {
      console.error('Generation error:', error);
      updateStep('Error', 'error', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (videoBlob) {
      const timestamp = new Date().getTime();
      downloadVideo(videoBlob, `konkokt-${timestamp}.webm`);
    }
  };

  const handleSignIn = async () => {
    const email = window.prompt('Enter your email:');
    const password = window.prompt('Enter your password:');

    if (email && password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) alert(signUpError.message);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <header className="flex items-center justify-center mb-16 relative">
          <div className="flex flex-col items-center">
            <img
              src="/C24E50A7-872B-4557-A884-2387165237FD.png"
              alt="Logo"
              className="h-48 w-auto mb-4"
            />
            <p className="text-slate-400 text-lg">Dark Comedy Story Videos</p>
          </div>

          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-3">
            {user && (
              <>
                <button
                  onClick={() => setShowLibrary(!showLibrary)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Library className="w-4 h-4" />
                  Library
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </>
            )}
            {user ? (
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {user && subscription && (
          <div className="mb-8 p-4 bg-slate-800 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown className={`w-6 h-6 ${subscription.plan_tier === 'pro' ? 'text-yellow-400' : subscription.plan_tier === 'basic' ? 'text-blue-400' : 'text-slate-400'}`} />
                <div>
                  <p className="text-white font-semibold capitalize">{subscription.plan_tier} Plan</p>
                  <p className="text-slate-400 text-sm">
                    {usage?.videos_generated || 0} / {subscription.plan_tier === 'free' ? 3 : subscription.plan_tier === 'basic' ? 20 : 100} videos this month
                  </p>
                </div>
              </div>
              {subscription.plan_tier === 'free' && (
                <a
                  href="https://bolt.new/setup/stripe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg transition-all"
                >
                  Upgrade Plan
                </a>
              )}
            </div>
          </div>
        )}

        {showSettings && user && (
          <div className="mb-8 p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Animation Provider
                </label>
                <select
                  value={animationProvider}
                  onChange={(e) => setAnimationProvider(e.target.value as AnimationProvider)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {getAvailableProviders().map((provider) => (
                    <option key={provider} value={provider}>
                      {provider === 'ken-burns' ? 'Ken Burns (Free - Zoom/Pan Effect)' :
                       provider === 'runwayml' ? 'Runway ML (Premium - AI Animation)' :
                       provider === 'kling' ? 'Kling AI (Premium - AI Animation)' :
                       provider === 'pixverse' ? 'PixVerse (Premium - AI Animation)' :
                       'LTX Studio (Premium - AI Animation)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-2">
                  {animationProvider === 'ken-burns'
                    ? 'Free zoom and pan effects on still images'
                    : 'AI-powered animation requires API key in .env file'}
                </p>
              </div>
            </div>
          </div>
        )}

        {showLibrary && user && (
          <div className="mb-8 p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Library className="w-5 h-5" />
              Your Videos ({savedVideos.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedVideos.length === 0 ? (
                <p className="text-slate-400 col-span-full text-center py-8">
                  No saved videos yet. Create your first story!
                </p>
              ) : (
                savedVideos.map((video) => (
                  <div key={video.id} className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                    <video
                      src={video.video_url}
                      className="w-full aspect-[9/16] object-cover"
                      controls
                    />
                    <div className="p-3">
                      <p className="text-white font-medium truncate">{video.title}</p>
                      <p className="text-slate-400 text-xs mt-1">
                        {new Date(video.created_at).toLocaleDateString()}
                      </p>
                      <button
                        onClick={async () => {
                          if (confirm('Delete this video?')) {
                            await deleteVideo(video.id, user.id);
                            await loadUserData();
                          }
                        }}
                        className="mt-2 w-full px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr,400px] gap-8">
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-cyan-400" />
              Create Your Story
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Story Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your story idea... (e.g., 'A brave astronaut discovers a mysterious alien artifact on Mars')"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                  rows={4}
                  disabled={isGenerating || !!uploadedScript}
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-700"></div>
                <span className="text-slate-500 text-sm font-medium">OR</span>
                <div className="flex-1 h-px bg-slate-700"></div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Upload Script
                </label>
                <div className="relative">
                  <textarea
                    value={uploadedScript}
                    onChange={(e) => setUploadedScript(e.target.value)}
                    placeholder="Paste your custom script here..."
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                    rows={3}
                    disabled={isGenerating || !!prompt}
                  />
                  <Upload className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Video Duration
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[60, 180, 300].map((dur) => (
                    <button
                      key={dur}
                      onClick={() => setDuration(dur as DurationOption)}
                      disabled={isGenerating}
                      className={`px-4 py-3 rounded-xl font-medium transition-all ${
                        duration === dur
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg scale-105'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {dur / 60} min
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  <Mic className="w-4 h-4 inline mr-2" />
                  Voice Configuration
                </label>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Narrator (Default Voice)</p>
                    <select
                      value={narratorVoice}
                      onChange={(e) => setNarratorVoice(e.target.value)}
                      disabled={isGenerating}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                    >
                      {voices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Character Voices (Auto-assigned from story)</p>
                    <div className="bg-slate-900 border border-slate-600 rounded-lg p-3">
                      <p className="text-slate-500 text-xs">
                        Characters will be automatically assigned unique voices when the story is generated
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || (!prompt && !uploadedScript)}
                className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Story Video
                  </>
                )}
              </button>
            </div>

            {generationSteps.length > 0 && (
              <div className="mt-8 space-y-3">
                <h3 className="text-lg font-semibold text-white mb-4">Generation Progress</h3>
                {generationSteps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 text-sm">
                    <div className="mt-1">
                      {step.status === 'completed' ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      ) : step.status === 'in-progress' ? (
                        <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                      ) : step.status === 'error' ? (
                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                          <span className="text-white text-xs">✕</span>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-slate-600"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{step.name}</p>
                      {step.message && (
                        <p className="text-slate-400 text-xs mt-1">{step.message}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isGenerating && progress > 0 && (
                  <div className="mt-4">
                    <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-slate-400 text-xs mt-2 text-center">{Math.round(progress)}%</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Play className="w-6 h-6 text-cyan-400" />
              Preview
            </h2>

            <div className="aspect-[9/16] bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700 relative">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="w-full h-full object-contain"
                  playsInline
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-8">
                  <img
                    src="/C24E50A7-872B-4557-A884-2387165237FD.png"
                    alt="Logo"
                    className="w-64 h-64 mb-6 opacity-40"
                  />
                  <p className="text-center px-4 text-lg">
                    Your mobile-ready vertical video will appear here
                  </p>
                  <p className="text-center px-4 text-sm text-slate-600 mt-2">
                    9:16 aspect ratio - perfect for social media
                  </p>
                </div>
              )}
            </div>

            {videoUrl && (
              <button
                onClick={handleDownload}
                className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Video
              </button>
            )}

            <div className="mt-6 p-4 bg-slate-900 rounded-xl border border-slate-700">
              <div className="flex items-start gap-3">
                <Mic className="w-5 h-5 text-cyan-400 mt-0.5" />
                <div className="text-sm text-slate-300">
                  <p className="font-semibold mb-1">Powered by Coqui XTTS</p>
                  <p className="text-slate-400 text-xs">
                    {voices.length} professional voices with natural speech synthesis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-12 text-center text-slate-500 text-sm">
          <p>Powered by Grok AI & Hugging Face FLUX</p>
        </footer>
      </div>
    </div>
  );
}
