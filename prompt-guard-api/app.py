from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import pipeline
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Prompt Guard API")

# Model załaduje się przy pierwszym uruchomieniu
classifier = None

class DetectRequest(BaseModel):
    text: str

@app.on_event("startup")
async def load_model():
    global classifier
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
    return {"status": "healthy", "model_loaded": classifier is not None}

@app.post("/detect")
def detect(request: DetectRequest):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Model not loaded - check volume configuration.")

    result = classifier(request.text)[0]

    # LABEL_0 = SAFE, LABEL_1 = ATTACK
    is_attack = result['label'] == 'LABEL_1'

    # risk_score: high for attacks (0.95), very low for safe (0.01)
    if is_attack:
        risk_score = 0.95  # CRITICAL - matches unified_config threshold
    else:
        risk_score = 0.01  # MINIMAL - safe content

    return {
        "text": request.text[:100],
        "is_attack": is_attack,
        "risk_score": risk_score,
        "confidence": result['score'],
        "verdict": "ATTACK DETECTED" if is_attack else "SAFE"
    }
