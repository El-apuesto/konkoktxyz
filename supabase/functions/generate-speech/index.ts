import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SpeechRequest {
  text: string;
  speaker: string;
}

const AVAILABLE_VOICES = [
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

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const VOICE_MAP: { [key: string]: string } = {
  "Claribel Dervla": "nova",
  "Daisy Studious": "alloy",
  "Gracie Wise": "shimmer",
  "Tammie Ema": "nova",
  "Alison Dietlinde": "echo",
  "Ana Florence": "shimmer",
  "Annmarie Nele": "nova",
  "Asya Anara": "shimmer",
  "Brenda Stern": "echo",
  "Gitta Nikolina": "alloy",
  "Henriette Usha": "nova",
  "Sofia Hellen": "shimmer",
  "Tammy Grit": "echo",
  "Tanja Adelina": "nova",
  "Vjollca Johnnie": "alloy",
  "Andrew Chipper": "onyx",
  "Badr Odhiambo": "onyx",
  "Dionisio Schuyler": "echo",
  "Royston Min": "fable",
  "Viktor Eka": "onyx",
  "Abrahan Mack": "fable",
  "Adde Michal": "echo",
  "Baldur Sanjin": "onyx",
  "Craig Gutsy": "onyx",
  "Damien Black": "onyx",
  "Gilberto Mathias": "fable",
  "Ilkin Urbano": "echo",
  "Kazuhiko Atallah": "fable",
  "Ludvig Milivoj": "echo",
  "Suad Qasim": "onyx",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/voices")) {
      return new Response(
        JSON.stringify({ voices: AVAILABLE_VOICES }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (req.method === "POST") {
      const { text, speaker = "Claribel Dervla" }: SpeechRequest = await req.json();

      if (!text) {
        return new Response(
          JSON.stringify({ error: "Text is required" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      if (!OPENAI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "OpenAI API key not configured" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const audioData = await generateSpeech(text, speaker);

      return new Response(audioData, {
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
        },
      });
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating speech:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate speech" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function generateSpeech(text: string, speaker: string): Promise<Uint8Array> {
  const openaiVoice = VOICE_MAP[speaker] || "alloy";

  console.log(`Generating speech with OpenAI TTS - Voice: ${openaiVoice}, Text length: ${text.length}`);

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: openaiVoice,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI TTS error: ${response.status} - ${errorText}`);
    throw new Error(`OpenAI TTS API error: ${response.status} - ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`Success! Received audio: ${audioBuffer.byteLength} bytes`);
  return new Uint8Array(audioBuffer);
}
