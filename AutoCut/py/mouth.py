#!/usr/bin/env python3
"""AutoCut - mede o movimento da boca quadro a quadro em um trecho de video.

Saida (stdout): JSON {"fps": F, "open": [..], "jaw": [..], "chin": [..], "artic": [..], "yaw": [..]}
  (-1 = sem rosto naquele quadro; yaw = -999 quando nao se sabe)

  open:  abertura dos labios medida AO LONGO do eixo vertical do rosto
  chin:  queixo-nariz no mesmo eixo (o queixo desce ao falar, mesmo com microfone na frente)
  jaw:   "jawOpen" do MediaPipe (ja vem normalizado pela pose da cabeca)
  artic: mistura de blendshapes da boca (abrir, arredondar, esticar) - articulacao
  yaw:   giro horizontal da cabeca em graus (0 = de frente, 90 = perfil)

Por que nao se mede mais pela largura da boca / distancia entre os olhos:
  essas sao distancias HORIZONTAIS e encolhem com o cosseno do giro da cabeca. Com a boca
  parada, so girando a cabeca ate o perfil, aquelas razoes infl am mais de 10x - a pessoa de
  perfil "parecia falar" o tempo todo. Os pontos usados agora (nasion, nariz, labios, queixo)
  ficam todos na linha do meio do rosto, e a medida e tomada na direcao do eixo do rosto:
  isso nao muda quando a cabeca gira de lado nem quando ela tomba.

Progresso (stderr): linhas "PROGRESS 0.42".
Compativel com Python 3.9.
"""
import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np
import mediapipe as mp

# pontos da malha de rosto do MediaPipe, todos na linha do meio do rosto
NASION = 168      # entre as sobrancelhas
NOSE_TIP = 1
UPPER_LIP = 13    # borda interna do labio superior
LOWER_LIP = 14    # borda interna do labio inferior
CHIN = 152

# blendshapes que acompanham a fala
ARTIC_SHAPES = {
    "jawOpen": 1.0,
    "mouthClose": 0.6,
    "mouthFunnel": 0.8,
    "mouthPucker": 0.6,
    "mouthStretchLeft": 0.4,
    "mouthStretchRight": 0.4,
    "mouthLowerDownLeft": 0.5,
    "mouthLowerDownRight": 0.5,
    "mouthUpperUpLeft": 0.4,
    "mouthUpperUpRight": 0.4,
}

NO_FACE = -1.0
NO_YAW = -999.0


def probe(ffprobe, path):
    out = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height:stream_side_data=rotation:stream_tags=rotate",
         "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    st = json.loads(out)["streams"][0]
    w, h = int(st["width"]), int(st["height"])
    rot = 0
    for sd in st.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    if not rot and "tags" in st and "rotate" in st["tags"]:
        rot = int(float(st["tags"]["rotate"]))
    if abs(rot) % 180 == 90:
        w, h = h, w
    return w, h


def axis_measures(lms, aspect):
    """Abertura da boca e queda do queixo medidas no eixo vertical do proprio rosto.

    Devolve (open, chin) ou (-1, -1) se nao der para medir. As coordenadas do MediaPipe sao
    normalizadas por largura/altura da imagem, entao a largura e multiplicada pelo aspecto
    para voltar a ser proporcional.
    """
    def pt(i):
        return (lms[i].x * aspect, lms[i].y)

    nas, nose = pt(NASION), pt(NOSE_TIP)
    ax, ay = nas[0] - nose[0], nas[1] - nose[1]
    ref = math.hypot(ax, ay)                  # segmento rigido do rosto: serve de escala
    if ref < 1e-6:
        return NO_FACE, NO_FACE
    ax, ay = ax / ref, ay / ref               # eixo "para cima" do rosto (absorve o tombo)

    up, lo, chin = pt(UPPER_LIP), pt(LOWER_LIP), pt(CHIN)
    gap = abs((lo[0] - up[0]) * ax + (lo[1] - up[1]) * ay) / ref
    drop = abs((chin[0] - nose[0]) * ax + (chin[1] - nose[1]) * ay) / ref
    return gap, drop


def blendshapes(cats):
    """jawOpen isolado e a mistura de articulacao."""
    jaw, artic, total = NO_FACE, 0.0, 0.0
    for c in cats or []:
        w = ARTIC_SHAPES.get(c.category_name)
        if w is not None:
            artic += w * float(c.score)
            total += w
        if c.category_name == "jawOpen":
            jaw = float(c.score)
    return jaw, (artic / total if total else NO_FACE)


def head_yaw(matrix):
    """Giro horizontal da cabeca, em graus (0 = de frente)."""
    try:
        m = np.array(matrix).reshape(4, 4)
        # coluna Z da rotacao aponta para onde o rosto olha
        return abs(math.degrees(math.asin(max(-1.0, min(1.0, float(m[0, 2]))))))
    except Exception:
        return NO_YAW


def face_size(lms):
    xs = [p.x for p in lms]
    ys = [p.y for p in lms]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--dur", type=float, required=True)
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--width", type=int, default=480)
    a = ap.parse_args()

    ffprobe = os.path.join(os.path.dirname(a.ffmpeg), "ffprobe") if os.path.dirname(a.ffmpeg) else "ffprobe"
    if not os.path.exists(a.file):
        sys.stderr.write("ERRO err.fileMissing|%s|\n" % a.file)
        sys.exit(2)
    try:
        sw, sh = probe(ffprobe, a.file)
    except Exception as e:  # sem video, arquivo corrompido, ffprobe ausente
        sys.stderr.write("ERRO err.videoUnreadable|%s|%s\n" % (a.file, e))
        sys.exit(2)
    W = min(a.width, sw - sw % 2)
    H = int(round(sh * W / sw / 2.0)) * 2
    aspect = float(W) / float(H)
    frame_bytes = W * H * 3
    total = max(1, int(a.dur * a.fps))

    cmd = [a.ffmpeg, "-v", "error", "-nostdin", "-ss", str(max(0.0, a.start)), "-t", str(a.dur),
           "-i", a.file, "-an", "-vf", "fps=%g,scale=%d:%d" % (a.fps, W, H),
           "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=frame_bytes * 4)

    # limiares baixos de proposito: de perfil a confianca cai, e perder o rosto e pior
    # do que aceitar uma deteccao mais fraca (o yaw informa o quanto confiar).
    opts = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=a.model),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_faces=2,
        min_face_detection_confidence=0.25,
        min_face_presence_confidence=0.25,
        min_tracking_confidence=0.25,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True)

    opens, jaws, chins, artics, yaws = [], [], [], [], []
    last_p = -1.0
    with mp.tasks.vision.FaceLandmarker.create_from_options(opts) as lm:
        i = 0
        while True:
            buf = proc.stdout.read(frame_bytes)
            if not buf or len(buf) < frame_bytes:
                break
            img = np.frombuffer(buf, dtype=np.uint8).reshape((H, W, 3))
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=img),
                                      int(round(i * 1000.0 / a.fps)))
            o = c = j = ar = NO_FACE
            yw = NO_YAW
            if res.face_landmarks:
                # rosto maior = pessoa daquela camera
                bi = max(range(len(res.face_landmarks)), key=lambda k: face_size(res.face_landmarks[k]))
                o, c = axis_measures(res.face_landmarks[bi], aspect)
                if res.face_blendshapes and bi < len(res.face_blendshapes):
                    j, ar = blendshapes(res.face_blendshapes[bi])
                mats = getattr(res, "facial_transformation_matrixes", None)
                if mats and bi < len(mats):
                    yw = head_yaw(mats[bi])
            opens.append(round(o, 5))
            chins.append(round(c, 5))
            jaws.append(round(j, 5))
            artics.append(round(ar, 5))
            yaws.append(round(yw, 1))
            i += 1
            p = min(1.0, i / float(total))
            if p - last_p >= 0.01:
                last_p = p
                sys.stderr.write("PROGRESS %.3f\n" % p)
                sys.stderr.flush()

    err = proc.stderr.read().decode("utf-8", "replace")
    proc.wait()
    if not opens:
        sys.stderr.write("ERRO err.videoUnreadable|%s|%s\n" % (a.file, err.strip()[:200]))
        sys.exit(2)
    json.dump({"fps": a.fps, "open": opens, "jaw": jaws, "chin": chins,
               "artic": artics, "yaw": yaws}, sys.stdout)


if __name__ == "__main__":
    main()
