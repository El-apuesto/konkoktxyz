# Coqui TTS API - Hugging Face Space with Gradio

A Gradio + FastAPI wrapper for Coqui TTS XTTS v2 model with both UI and REST API endpoints.

## Features

- 30+ professional voices with XTTS v2
- Gradio UI for testing
- REST API endpoints
- Free GPU access with Hugging Face Pro
- CORS enabled for web applications
- Base64 and binary audio output formats

## Deployment to Hugging Face Spaces

### Step 1: Create a New Space

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces)
2. Click "Create new Space"
3. Choose:
   - **Space name**: Your choice (e.g., `coqui-tts-api`)
   - **License**: Apache 2.0
   - **Space SDK**: Gradio
   - **Space hardware**: GPU (free with Pro subscription)

### Step 2: Upload Files

Upload these files to your Space:

1. `app.py` - Main application with Gradio UI and FastAPI
2. `requirements.txt` - Python dependencies

That's it! No Dockerfile needed with Gradio SDK.

## API Endpoints

### Health Check
```bash
GET /health
```

### Get Available Speakers
```bash
GET /api/speakers
```

### Synthesize Speech (Binary WAV)
```bash
POST /api/tts/audio
Content-Type: application/json

{
  "text": "Hello, this is a test",
  "speaker": "Claribel Dervla",
  "language": "en"
}
```

### Synthesize Speech (Base64)
```bash
POST /api/tts
Content-Type: application/json

{
  "text": "Hello, this is a test",
  "speaker": "Claribel Dervla",
  "language": "en"
}
```

### Multi-Speaker Synthesis
```bash
POST /api/tts/multi
Content-Type: application/json

{
  "segments": [
    {"text": "Hello from speaker one", "speaker": "Claribel Dervla"},
    {"text": "And hello from speaker two", "speaker": "Andrew Chipper"}
  ]
}
```

## Available Speakers

30 professional voices including:

**Female Voices:**
- Claribel Dervla
- Daisy Studious
- Gracie Wise
- Tammie Ema
- Alison Dietlinde
- Ana Florence
- And more...

**Male Voices:**
- Andrew Chipper
- Badr Odhiambo
- Dionisio Schuyler
- Royston Min
- Viktor Eka
- And more...

## Testing Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py

# Test with curl
curl -X POST http://localhost:7860/api/tts/audio \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "speaker": "Claribel Dervla", "language": "en"}' \
  --output test.wav
```

## Using in Your Application

Once deployed, use your Space URL:

```javascript
const response = await fetch('https://your-username-space-name.hf.space/api/tts/audio', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Your text here',
    speaker: 'Claribel Dervla',
    language: 'en'
  })
});

const audioBlob = await response.blob();
const audioUrl = URL.createObjectURL(audioBlob);
const audio = new Audio(audioUrl);
audio.play();
```

## Notes

- First request may be slow as the model loads (30-60 seconds)
- Subsequent requests are faster
- GPU Space recommended for production use
- Free CPU tier works but is slower

## Troubleshooting

If you see "TTS module not found":
1. Make sure `requirements.txt` is uploaded
2. Check that Dockerfile installs dependencies
3. Wait for Space to finish building (check logs)

## License

Apache 2.0
