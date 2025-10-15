from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import torch
from TTS.api import TTS
import io
import numpy as np
import scipy.io.wavfile as wavfile
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

tts_model = None
available_speakers = []

class TTSRequest(BaseModel):
    text: str
    speaker: Optional[str] = None
    language: Optional[str] = "en"

def initialize_model():
    """Initialize TTS model"""
    global tts_model, available_speakers
    try:
        logger.info("Initializing Coqui TTS XTTS v2...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")

        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

        if hasattr(tts_model, 'speakers') and tts_model.speakers:
            available_speakers = tts_model.speakers
            logger.info(f"Available speakers: {available_speakers}")
        else:
            available_speakers = [
                "Claribel Dervla", "Daisy Studious", "Gracie Wise", "Tammie Ema",
                "Alison Dietlinde", "Ana Florence", "Annmarie Nele", "Asya Anara",
                "Brenda Stern", "Gitta Nikolina", "Henriette Usha", "Sofia Hellen",
                "Tammy Grit", "Tanja Adelina", "Vjollca Johnnie", "Andrew Chipper",
                "Badr Odhiambo", "Dionisio Schuyler", "Royston Min", "Viktor Eka",
                "Abrahan Mack", "Adde Michal", "Baldur Sanjin", "Craig Gutsy",
                "Damien Black", "Gilberto Mathias", "Ilkin Urbano", "Kazuhiko Atallah",
                "Ludvig Milivoj", "Suad Qasim"
            ]
            logger.info("Using default XTTS v2 speaker list")

        logger.info("Coqui TTS initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing TTS: {str(e)}")
        raise

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize TTS model on startup"""
    initialize_model()

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Coqui TTS API Server",
        "status": "running",
        "model": "XTTS v2",
        "endpoints": {
            "synthesize_binary": "/api/tts/audio",
            "speakers": "/api/speakers",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": tts_model is not None,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "speakers_available": len(available_speakers)
    }

@app.get("/api/speakers")
async def get_speakers():
    """Get list of available speakers"""
    if tts_model is None:
        raise HTTPException(status_code=503, detail="TTS model not initialized")

    return {
        "speakers": available_speakers,
        "count": len(available_speakers),
        "model": "XTTS v2"
    }

@app.post("/api/tts/audio")
async def synthesize_speech_binary(request: TTSRequest):
    """
    Synthesize speech and return raw audio binary
    This is the main endpoint for direct audio playback
    """
    if tts_model is None:
        raise HTTPException(status_code=503, detail="TTS model not initialized")

    try:
        logger.info(f"Synthesizing text: {request.text[:50]}... (Speaker: {request.speaker})")

        speaker = request.speaker if request.speaker else available_speakers[0]

        wav = tts_model.tts(
            text=request.text,
            speaker=speaker,
            language=request.language
        )

        audio_buffer = io.BytesIO()
        sample_rate = tts_model.synthesizer.output_sample_rate
        wavfile.write(audio_buffer, sample_rate, np.array(wav))
        audio_buffer.seek(0)

        return Response(
            content=audio_buffer.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=speech.wav",
                "Access-Control-Allow-Origin": "*"
            }
        )

    except Exception as e:
        logger.error(f"Error during synthesis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
