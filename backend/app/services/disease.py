"""Leaf photo check: a MobileNetV2 classifier for 38 PlantVillage classes (14 plants) in ONNX.

Model: onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX (float32), a fine-tune
of google/mobilenet_v2_1.0_224 on the Kaggle "New Plant Diseases" version of PlantVillage; 95.4% accuracy
on that dataset's evaluation split. PlantVillage photos are single leaves on plain backgrounds, so field
photos score lower: results are a first check, not a diagnosis.
"""
import io
import json
import os
from functools import lru_cache
from threading import Lock

import numpy as np

MODEL_DIR = os.path.join("models", "disease")
MAX_BYTES = 8 * 1024 * 1024
SOURCE = "MobileNetV2 fine-tuned on PlantVillage (38 classes), ONNX"
CONFIDENT = 0.6

_lock = Lock()

# Treatment guidance by disease keyword (general practice; local extension advice takes precedence).
ADVICE = {
    "scab": "Remove fallen infected leaves; apply a protective fungicide (e.g. captan or mancozeb) from bud break in wet weather.",
    "black rot": "Prune out cankers and mummified fruit; keep the canopy open; use a labelled fungicide in wet periods.",
    "rust": "Remove nearby alternate hosts where practical; plant resistant varieties; apply a labelled fungicide early.",
    "powdery mildew": "Improve air flow; avoid excess nitrogen; sulfur or potassium bicarbonate sprays work early on.",
    "cercospora": "Rotate crops and bury residue; use resistant hybrids; a strobilurin or triazole fungicide if it reaches upper leaves.",
    "northern leaf blight": "Rotate away from maize; till residue where suitable; resistant hybrids; fungicide at tasseling if severe.",
    "esca": "Prune out dead wood in dry weather and protect pruning wounds; no curative spray exists.",
    "leaf spot": "Remove infected leaves; avoid overhead watering; use a copper or chlorothalonil spray if it spreads.",
    "citrus greening": "No cure: remove infected trees and control the psyllid vector; use certified clean planting material.",
    "bacterial spot": "Use clean seed and transplants; avoid working wet plants; copper sprays slow spread.",
    "early blight": "Remove lower infected leaves; mulch to stop soil splash; rotate crops; chlorothalonil or mancozeb if spreading.",
    "late blight": "Act fast: remove and destroy infected plants; protectant fungicide on the rest; avoid overhead irrigation.",
    "leaf scorch": "Remove infected leaves after harvest; renovate beds; keep foliage dry.",
    "leaf mold": "Lower humidity (ventilate, space plants); remove infected leaves; resistant varieties.",
    "spider mites": "Spray the undersides of leaves with water; use insecticidal soap or a miticide; avoid broad-spectrum insecticides that kill predators.",
    "target spot": "Improve air flow; remove lower leaves; rotate crops; labelled fungicide if needed.",
    "yellow leaf curl": "Viral, spread by whiteflies: remove infected plants, control whiteflies, use resistant varieties and insect netting.",
    "mosaic virus": "Viral: remove infected plants; wash hands and tools; don't use tobacco near plants; resistant varieties.",
}


class DiseaseModelUnavailable(Exception):
    pass


@lru_cache(maxsize=1)
def _model():
    try:
        import onnxruntime as ort
    except ImportError as e:  # pragma: no cover - dependency missing
        raise DiseaseModelUnavailable("The leaf-check model runtime is not installed.") from e
    path = os.path.join(MODEL_DIR, "model.onnx")
    if not os.path.exists(path):
        raise DiseaseModelUnavailable("The leaf-check model file is missing.")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    session = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
    with open(os.path.join(MODEL_DIR, "config.json"), encoding="utf-8") as f:
        labels = {int(k): v for k, v in json.load(f)["id2label"].items()}
    return session, labels


def labels() -> list[str]:
    return [v for _, v in sorted(_model()[1].items())]


def _preprocess(data: bytes) -> np.ndarray:
    from PIL import Image, UnidentifiedImageError

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError("That file isn't a readable image. Upload a JPEG or PNG photo of one leaf.") from e
    img = img.convert("RGB")
    # As the model's preprocessor: shortest edge 256 (bilinear), centre crop 224, scale to [-1, 1].
    w, h = img.size
    s = 256 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BILINEAR)
    w, h = img.size
    left, top = (w - 224) // 2, (h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    x = (np.asarray(img, dtype=np.float32) / 255.0 - 0.5) / 0.5
    return x.transpose(2, 0, 1)[None, ...]


def _split(label: str) -> tuple[str, str]:
    """'Tomato with Early Blight' -> ('Tomato', 'Early Blight'); 'Healthy Corn (Maize) Plant' -> ('Corn (Maize)', 'Healthy')."""
    if label.startswith("Healthy "):
        return label[len("Healthy ") :].replace(" Plant", "").strip(), "Healthy"
    if " with " in label:
        plant, disease = label.split(" with ", 1)
        return plant.strip(), disease.strip()
    for plant in ("Tomato", "Apple", "Corn (Maize)", "Grape", "Potato"):
        if label.startswith(plant + " "):
            return plant, label[len(plant) + 1 :].strip()
    return label, label


def _advice(disease: str) -> str:
    d = disease.lower()
    if d == "healthy":
        return "No disease detected. Keep scouting weekly, especially after warm, wet spells."
    for key, text in ADVICE.items():
        if key in d:
            return text
    return "Confirm with your local extension officer before treating."


def classify(data: bytes) -> dict:
    if not data:
        raise ValueError("Upload a photo of one leaf.")
    if len(data) > MAX_BYTES:
        raise ValueError("The photo is larger than 8 MB. Use a smaller image.")
    session, names = _model()
    x = _preprocess(data)
    with _lock:
        logits = session.run(None, {session.get_inputs()[0].name: x})[0][0]
    p = np.exp(logits - logits.max())
    p = p / p.sum()
    top = np.argsort(p)[::-1][:3]
    results = []
    for i in top:
        plant, disease = _split(names[int(i)])
        results.append({"label": names[int(i)], "plant": plant, "disease": disease, "probability": round(float(p[i]), 4)})
    best = results[0]
    confident = best["probability"] >= CONFIDENT
    return {
        "source": SOURCE,
        "top": results,
        "confident": confident,
        "healthy": best["disease"] == "Healthy",
        "advice": _advice(best["disease"]) if confident else "The model isn't sure. Retake the photo: one leaf, filling the frame, in daylight, on a plain background.",
        "note": "Trained on PlantVillage photos (single leaves on plain backgrounds) for 14 plants: apple, blueberry, cherry, maize, grape, orange, "
        "peach, bell pepper, potato, raspberry, soybean, squash, strawberry and tomato. Field photos and other crops score lower. "
        "This is a first check, not a diagnosis.",
    }
