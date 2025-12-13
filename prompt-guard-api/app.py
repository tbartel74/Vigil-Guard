"""
Prompt Guard API - Binary classifier for prompt injection detection.
TODO: Add rate limiting middleware
TODO: Add optional auth header validation
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import pipeline
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Prompt Guard API")

# Model loads on first startup
classifier = None
mock_mode = os.getenv("MOCK_MODEL", "false").lower() == "true"

class DetectRequest(BaseModel):
    text: str

@app.on_event("startup")
async def load_model():
    global classifier

    if mock_mode:
        logger.warning("MOCK_MODEL=true - Running in mock mode for testing")
        logger.warning("Mock classifier will return dummy responses")
        classifier = "mock"  # Signal that we're in mock mode
        return

    logger.info("Loading model from local directory...")
    try:
        classifier = pipeline(
            "text-classification",
            model="/app/model",
            device=-1  # CPU only
        )
    except Exception as exc:  # noqa: BLE001
        classifier = None
        logger.exception("Failed to load model: %s", exc)
        return
    logger.info("Model loaded successfully!")

@app.get("/")
def root():
    return {"status": "running", "message": "Prompt Guard API"}

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": classifier is not None,
        "mock_mode": mock_mode
    }

@app.post("/detect")
def detect(request: DetectRequest):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Model not loaded - check volume configuration.")

    # Mock mode: return deterministic dummy response
    if mock_mode:
        is_attack = "ignore" in request.text.lower() or "malicious" in request.text.lower()
        return {
            "text": request.text[:100],
            "is_attack": is_attack,
            "risk_score": 0.95 if is_attack else 0.01,
            "confidence": 0.99,
            "verdict": "ATTACK DETECTED (MOCK)" if is_attack else "SAFE (MOCK)"
        }

    result = classifier(request.text)[0]

    # LABEL_0 = SAFE, LABEL_1 = ATTACK
    is_attack = result['label'] == 'LABEL_1'
    risk_score = 0.95 if is_attack else 0.01

    return {
        "text": request.text[:100],
        "is_attack": is_attack,
        "risk_score": risk_score,
        "confidence": result['score'],
        "verdict": "ATTACK DETECTED" if is_attack else "SAFE"
    }
