export type AnimationProvider = 'runwayml' | 'kling' | 'pixverse' | 'ltx-studio' | 'ken-burns';

export interface AnimationOptions {
  provider: AnimationProvider;
  duration: number;
  imageUrl: string;
  prompt?: string;
}

async function generateRunwayAnimation(imageUrl: string, duration: number, prompt?: string): Promise<Blob> {
  const apiKey = import.meta.env.VITE_RUNWAYML_API_KEY;
  if (!apiKey) throw new Error('Runway API key not configured');

  const response = await fetch('https://api.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      duration,
      prompt: prompt || 'smooth camera movement',
      model: 'gen3a_turbo',
    }),
  });

  if (!response.ok) {
    throw new Error(`Runway API failed: ${response.status}`);
  }

  const { id } = await response.json();

  let attempts = 0;
  while (attempts < 60) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`https://api.runwayml.com/v1/tasks/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const status = await statusResponse.json();

    if (status.status === 'SUCCEEDED') {
      const videoResponse = await fetch(status.output.video_url);
      return await videoResponse.blob();
    } else if (status.status === 'FAILED') {
      throw new Error('Runway generation failed');
    }

    attempts++;
  }

  throw new Error('Runway generation timeout');
}

async function generateKlingAnimation(imageUrl: string, duration: number): Promise<Blob> {
  const apiKey = import.meta.env.VITE_KLING_API_KEY;
  if (!apiKey) throw new Error('Kling API key not configured');

  const response = await fetch('https://api.klingai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      duration,
      mode: 'standard',
    }),
  });

  if (!response.ok) {
    throw new Error(`Kling API failed: ${response.status}`);
  }

  const { task_id } = await response.json();

  let attempts = 0;
  while (attempts < 60) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`https://api.klingai.com/v1/images/generations/${task_id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const status = await statusResponse.json();

    if (status.task_status === 'succeed') {
      const videoResponse = await fetch(status.task_result.videos[0].url);
      return await videoResponse.blob();
    } else if (status.task_status === 'failed') {
      throw new Error('Kling generation failed');
    }

    attempts++;
  }

  throw new Error('Kling generation timeout');
}

async function generatePixVerseAnimation(imageUrl: string, duration: number, prompt?: string): Promise<Blob> {
  const apiKey = import.meta.env.VITE_PIXVERSE_API_KEY;
  if (!apiKey) throw new Error('PixVerse API key not configured');

  const response = await fetch('https://api.pixverse.ai/v2/image-to-video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      duration,
      prompt: prompt || 'cinematic camera movement',
    }),
  });

  if (!response.ok) {
    throw new Error(`PixVerse API failed: ${response.status}`);
  }

  const { id } = await response.json();

  let attempts = 0;
  while (attempts < 60) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`https://api.pixverse.ai/v2/tasks/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const status = await statusResponse.json();

    if (status.state === 'completed') {
      const videoResponse = await fetch(status.video_url);
      return await videoResponse.blob();
    } else if (status.state === 'failed') {
      throw new Error('PixVerse generation failed');
    }

    attempts++;
  }

  throw new Error('PixVerse generation timeout');
}

async function generateLTXAnimation(imageUrl: string, duration: number, prompt?: string): Promise<Blob> {
  const apiKey = import.meta.env.VITE_LTX_API_KEY;
  if (!apiKey) throw new Error('LTX Studio API key not configured');

  const response = await fetch('https://api.ltx.studio/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      duration,
      prompt: prompt || 'smooth cinematic motion',
    }),
  });

  if (!response.ok) {
    throw new Error(`LTX Studio API failed: ${response.status}`);
  }

  const { job_id } = await response.json();

  let attempts = 0;
  while (attempts < 60) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`https://api.ltx.studio/v1/status/${job_id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const status = await statusResponse.json();

    if (status.status === 'completed') {
      const videoResponse = await fetch(status.output_url);
      return await videoResponse.blob();
    } else if (status.status === 'failed') {
      throw new Error('LTX Studio generation failed');
    }

    attempts++;
  }

  throw new Error('LTX Studio generation timeout');
}

export async function animateImage(options: AnimationOptions): Promise<Blob> {
  switch (options.provider) {
    case 'runwayml':
      return generateRunwayAnimation(options.imageUrl, options.duration, options.prompt);
    case 'kling':
      return generateKlingAnimation(options.imageUrl, options.duration);
    case 'pixverse':
      return generatePixVerseAnimation(options.imageUrl, options.duration, options.prompt);
    case 'ltx-studio':
      return generateLTXAnimation(options.imageUrl, options.duration, options.prompt);
    case 'ken-burns':
      throw new Error('Ken Burns fallback handled in videoService');
    default:
      throw new Error(`Unknown animation provider: ${options.provider}`);
  }
}

export function isAnimationProviderConfigured(provider: AnimationProvider): boolean {
  switch (provider) {
    case 'runwayml':
      return !!import.meta.env.VITE_RUNWAYML_API_KEY;
    case 'kling':
      return !!import.meta.env.VITE_KLING_API_KEY;
    case 'pixverse':
      return !!import.meta.env.VITE_PIXVERSE_API_KEY;
    case 'ltx-studio':
      return !!import.meta.env.VITE_LTX_API_KEY;
    case 'ken-burns':
      return true;
    default:
      return false;
  }
}

export function getAvailableProviders(): AnimationProvider[] {
  const providers: AnimationProvider[] = ['ken-burns'];

  if (import.meta.env.VITE_RUNWAYML_API_KEY) providers.unshift('runwayml');
  if (import.meta.env.VITE_KLING_API_KEY) providers.unshift('kling');
  if (import.meta.env.VITE_PIXVERSE_API_KEY) providers.unshift('pixverse');
  if (import.meta.env.VITE_LTX_API_KEY) providers.unshift('ltx-studio');

  return providers;
}
