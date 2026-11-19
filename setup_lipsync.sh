#!/bin/bash
# Prepara o modo "Áudio único" do AutoCut: Python isolado + MediaPipe + modelo de rosto.
# Para remover: apague a pasta ~/Library/Application Support/AutoCut
set -e
BASE="$HOME/Library/Application Support/AutoCut"
PY="${PYTHON:-/usr/bin/python3}"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

mkdir -p "$BASE"
if [ ! -x "$BASE/venv/bin/python" ]; then
  "$PY" -m venv "$BASE/venv"
fi
"$BASE/venv/bin/python" -m pip install --quiet --upgrade pip
"$BASE/venv/bin/python" -m pip install --quiet mediapipe numpy

if [ ! -s "$BASE/face_landmarker.task" ]; then
  curl -fsSL -o "$BASE/face_landmarker.task.part" "$MODEL_URL"
  mv "$BASE/face_landmarker.task.part" "$BASE/face_landmarker.task"
fi

"$BASE/venv/bin/python" -c "import mediapipe, numpy; print('mediapipe', mediapipe.__version__, '| numpy', numpy.__version__)"
echo "Pronto: $BASE"
