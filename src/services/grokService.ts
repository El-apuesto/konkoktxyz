const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a dark comedy storyteller with a twisted sense of humor. Your stories are engaging, unexpected, and have a cynical edge. You excel at creating narratives that blend humor with darker themes, satire, and ironic twists. Keep your stories entertaining while maintaining a slightly sinister undertone.`;

interface Character {
  name: string;
  description: string;
  voice: string;
}

interface Scene {
  narration: string;
  visualPrompt: string;
  duration: number;
  character?: string;
}

interface StoryData {
  title: string;
  script: string;
  characters: Character[];
  scenes: Scene[];
}

interface ImagePrompt {
  prompt: string;
  timestampStart: number;
  timestampEnd: number;
}

export async function generateStory(prompt: string, durationSeconds: number): Promise<StoryData> {
  const apiKey = import.meta.env.VITE_XAI_API_KEY;

  if (!apiKey) {
    throw new Error('Grok API key not configured');
  }

  const sceneCount = Math.ceil(durationSeconds / 6);

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-2-1212',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Create a dark comedy story based on this prompt: "${prompt}"

The story should be approximately ${durationSeconds} seconds long when narrated (about ${Math.floor(durationSeconds / 3)} words).

Return ONLY valid JSON in this exact format:
{
  "title": "Story title",
  "script": "The full narrative text",
  "characters": [
    {
      "name": "Character Name",
      "description": "Character description",
      "voice": "male" or "female"
    }
  ],
  "scenes": [
    {
      "narration": "Scene narration text",
      "character": "Character name speaking (optional)",
      "duration": 8
    }
  ]
}

Make exactly ${sceneCount} scenes. Each scene should be 5-7 seconds of narration.`
        }
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse story JSON from response');
  }

  const storyData: StoryData = JSON.parse(jsonMatch[0]);

  const scenesWithVisuals = await Promise.all(
    storyData.scenes.map(async (scene) => ({
      ...scene,
      visualPrompt: await generateVisualPrompt(scene.narration),
    }))
  );

  return {
    ...storyData,
    scenes: scenesWithVisuals,
  };
}

async function generateVisualPrompt(narration: string): Promise<string> {
  const apiKey = import.meta.env.VITE_XAI_API_KEY;

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-2-1212',
      messages: [
        {
          role: 'system',
          content: 'You create detailed visual prompts for AI image generation. Focus on composition, lighting, mood, and artistic style. Be specific and descriptive.'
        },
        {
          role: 'user',
          content: `Create a detailed image generation prompt for this scene: "${narration}"

Return ONLY the prompt text, no explanations. Make it detailed, cinematic, and suitable for Stable Diffusion.`
        }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate visual prompt: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

export async function generateImagePrompts(
  script: string,
  characters: Character[],
  durationSeconds: number
): Promise<ImagePrompt[]> {
  const apiKey = import.meta.env.VITE_XAI_API_KEY;
  const sceneCount = Math.ceil(durationSeconds / 6);
  const sceneDuration = durationSeconds / sceneCount;

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-2-1212',
      messages: [
        {
          role: 'system',
          content: 'You create detailed visual prompts for AI image generation based on story scripts.'
        },
        {
          role: 'user',
          content: `Based on this script, create ${sceneCount} detailed image generation prompts:

"${script}"

Characters: ${characters.map(c => `${c.name} - ${c.description}`).join(', ')}

Return ONLY valid JSON array:
[
  {
    "prompt": "Detailed image prompt with composition, lighting, and style",
    "timestampStart": 0,
    "timestampEnd": ${sceneDuration}
  }
]

Each prompt should be cinematic and detailed for Stable Diffusion.`
        }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate image prompts: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse prompts JSON');
  }

  return JSON.parse(jsonMatch[0]);
}
