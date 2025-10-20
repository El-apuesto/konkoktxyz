// Hugging Face Mistral story generator
export interface Scene {
  narration: string;
  visualPrompt: string;
  duration: number;
  character?: string;
}

export interface StoryData {
  title: string;
  script: string;
  characters: Array<{ name: string; description: string; voice: string }>;
  scenes: Scene[];
}

const HF_API_KEY = import.meta.env.VITE_HUGGINGFACE_API_KEY;
const HF_MODEL_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2';

export async function generateStory(prompt: string, durationSeconds: number): Promise<StoryData> {
  if (!HF_API_KEY) throw new Error('Hugging Face API key not configured');

  const sceneCount = Math.ceil(durationSeconds / 6);

  const response = await fetch(HF_MODEL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hugging Face story generation failed: ${error}`);
  }

  const data = await response.json();
  const text = data[0]?.generated_text || 'No story generated.';

  // Split story into scenes
  const scenes: Scene[] = Array.from({ length: sceneCount }, (_, i) => ({
    narration: text, // for now each scene gets full text; you can split logic later
    visualPrompt: text,
    duration: Math.floor(durationSeconds / sceneCount),
  }));

  return {
    title: prompt.slice(0, 20),
    script: text,
    characters: [],
    scenes,
  };
}