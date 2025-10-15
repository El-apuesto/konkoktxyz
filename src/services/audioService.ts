export interface VoiceConfig {
  id: string;
  name: string;
  gender: string;
  language: string;
}

interface SceneAudio {
  narration: string;
  duration: number;
  character?: string;
}

const AVAILABLE_VOICES: VoiceConfig[] = [
  { id: "Claribel Dervla", name: "Claribel Dervla (Female, Warm)", gender: "female", language: "en" },
  { id: "Daisy Studious", name: "Daisy Studious (Female, Clear)", gender: "female", language: "en" },
  { id: "Gracie Wise", name: "Gracie Wise (Female, Professional)", gender: "female", language: "en" },
  { id: "Tammie Ema", name: "Tammie Ema (Female, Young)", gender: "female", language: "en" },
  { id: "Alison Dietlinde", name: "Alison Dietlinde (Female, Narrator)", gender: "female", language: "en" },
  { id: "Ana Florence", name: "Ana Florence (Female, Calm)", gender: "female", language: "en" },
  { id: "Annmarie Nele", name: "Annmarie Nele (Female, Energetic)", gender: "female", language: "en" },
  { id: "Asya Anara", name: "Asya Anara (Female, Expressive)", gender: "female", language: "en" },
  { id: "Brenda Stern", name: "Brenda Stern (Female, Authoritative)", gender: "female", language: "en" },
  { id: "Gitta Nikolina", name: "Gitta Nikolina (Female, Gentle)", gender: "female", language: "en" },
  { id: "Henriette Usha", name: "Henriette Usha (Female, Storyteller)", gender: "female", language: "en" },
  { id: "Sofia Hellen", name: "Sofia Hellen (Female, Elegant)", gender: "female", language: "en" },
  { id: "Tammy Grit", name: "Tammy Grit (Female, Strong)", gender: "female", language: "en" },
  { id: "Tanja Adelina", name: "Tanja Adelina (Female, Dramatic)", gender: "female", language: "en" },
  { id: "Vjollca Johnnie", name: "Vjollca Johnnie (Female, Upbeat)", gender: "female", language: "en" },
  { id: "Andrew Chipper", name: "Andrew Chipper (Male, Cheerful)", gender: "male", language: "en" },
  { id: "Badr Odhiambo", name: "Badr Odhiambo (Male, Deep)", gender: "male", language: "en" },
  { id: "Dionisio Schuyler", name: "Dionisio Schuyler (Male, Professional)", gender: "male", language: "en" },
  { id: "Royston Min", name: "Royston Min (Male, Narrator)", gender: "male", language: "en" },
  { id: "Viktor Eka", name: "Viktor Eka (Male, Authoritative)", gender: "male", language: "en" },
  { id: "Abrahan Mack", name: "Abrahan Mack (Male, Storyteller)", gender: "male", language: "en" },
  { id: "Adde Michal", name: "Adde Michal (Male, Calm)", gender: "male", language: "en" },
  { id: "Baldur Sanjin", name: "Baldur Sanjin (Male, Strong)", gender: "male", language: "en" },
  { id: "Craig Gutsy", name: "Craig Gutsy (Male, Bold)", gender: "male", language: "en" },
  { id: "Damien Black", name: "Damien Black (Male, Dramatic)", gender: "male", language: "en" },
  { id: "Gilberto Mathias", name: "Gilberto Mathias (Male, Expressive)", gender: "male", language: "en" },
  { id: "Ilkin Urbano", name: "Ilkin Urbano (Male, Urban)", gender: "male", language: "en" },
  { id: "Kazuhiko Atallah", name: "Kazuhiko Atallah (Male, Wise)", gender: "male", language: "en" },
  { id: "Ludvig Milivoj", name: "Ludvig Milivoj (Male, Gentle)", gender: "male", language: "en" },
  { id: "Suad Qasim", name: "Suad Qasim (Male, Energetic)", gender: "male", language: "en" },
];

export function getAvailableVoices(): VoiceConfig[] {
  return AVAILABLE_VOICES;
}

export async function generateNarration(text: string, voiceId: string): Promise<Blob> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      speaker: voiceId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Speech generation failed: ${response.status}`);
  }

  return await response.blob();
}

export async function createAudioFromScenes(
  scenes: SceneAudio[],
  defaultVoice: string,
  characterVoices?: Map<string, string>
): Promise<string> {
  const audioContext = new AudioContext();
  const audioBuffers: AudioBuffer[] = [];

  for (const scene of scenes) {
    const voiceId = scene.character && characterVoices?.has(scene.character)
      ? characterVoices.get(scene.character)!
      : defaultVoice;

    const audioBlob = await generateNarration(scene.narration, voiceId);
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioBuffers.push(audioBuffer);
  }

  const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const mergedBuffer = audioContext.createBuffer(
    2,
    totalLength,
    audioContext.sampleRate
  );

  let offset = 0;
  for (const buffer of audioBuffers) {
    for (let channel = 0; channel < 2; channel++) {
      const outputData = mergedBuffer.getChannelData(channel);
      const inputData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
      outputData.set(inputData, offset);
    }
    offset += buffer.length;
  }

  const wav = audioBufferToWav(mergedBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const length = buffer.length * buffer.numberOfChannels * 2;
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
  view.setUint16(22, buffer.numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
  view.setUint16(32, buffer.numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}
