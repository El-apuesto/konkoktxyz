const HF_API_URL = 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell';

export async function generateImage(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;

  if (!apiKey) {
    throw new Error('Hugging Face API key not configured');
  }

  const enhancedPrompt = `${prompt}, cinematic lighting, high quality, detailed, professional photography, 8k`;

  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: enhancedPrompt,
      parameters: {
        guidance_scale: 7.5,
        num_inference_steps: 4,
        width: 1080,
        height: 1920,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('HF API Error:', error);

    if (response.status === 503) {
      await new Promise(resolve => setTimeout(resolve, 20000));
      return generateImage(prompt);
    }

    throw new Error(`Image generation failed: ${response.status}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
