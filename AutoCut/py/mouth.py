#!/usr/bin/env python3
"""AutoCut - mede a abertura da boca quadro a quadro em um trecho de video.

Saida (stdout): JSON {"fps": F, "open": [..], "jaw": [..], "chin": [..]}  (-1 = sem rosto)
  open: abertura dos labios (altura/largura da boca)
  jaw:  "jawOpen" do MediaPipe (mandibula aberta, estimada pelo rosto todo)
  chin: distancia nariz-queixo / distancia entre os olhos (o queixo desce ao falar,
        mesmo com um microfone na frente da boca)
Progresso (stderr): linhas "PROGRESS 0.42".
Compativel com Python 3.9.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import mediapipe as mp

# indices da malha de rosto do MediaPipe
UPPER_LIP, LOWER_LIP = 13, 14
MOUTH_LEFT, MOUTH_RIGHT = 78, 308
NOSE_TIP, CHIN = 1, 152
EYE_LEFT, EYE_RIGHT = 33, 263


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


def mouth_open(lms):
    up, lo = lms[UPPER_LIP], lms[LOWER_LIP]
    le, ri = lms[MOUTH_LEFT], lms[MOUTH_RIGHT]
    width = ((le.x - ri.x) ** 2 + (le.y - ri.y) ** 2) ** 0.5
    if width < 1e-6:
        return -1.0
    return (((up.x - lo.x) ** 2 + (up.y - lo.y) ** 2) ** 0.5) / width


def dist(a, b):
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5


def chin_drop(lms):
    eyes = dist(lms[EYE_LEFT], lms[EYE_RIGHT])
    if eyes < 1e-6:
        return -1.0
    return dist(lms[NOSE_TIP], lms[CHIN]) / eyes


def jaw_open(blendshapes):
    for c in blendshapes or []:
        if c.category_name == "jawOpen":
            return float(c.score)
    return -1.0


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
    frame_bytes = W * H * 3
    total = max(1, int(a.dur * a.fps))

    cmd = [a.ffmpeg, "-v", "error", "-nostdin", "-ss", str(max(0.0, a.start)), "-t", str(a.dur),
           "-i", a.file, "-an", "-vf", "fps=%g,scale=%d:%d" % (a.fps, W, H),
           "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=frame_bytes * 4)

    opts = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=a.model),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_faces=2,
        min_face_detection_confidence=0.4,
        min_face_presence_confidence=0.4,
        min_tracking_confidence=0.4,
        output_face_blendshapes=True)

    values, jaws, chins = [], [], []
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
            v, jw, ch = -1.0, -1.0, -1.0
            if res.face_landmarks:
                # rosto maior = pessoa da camera
                bi = max(range(len(res.face_landmarks)), key=lambda k: face_size(res.face_landmarks[k]))
                best = res.face_landmarks[bi]
                v = mouth_open(best)
                ch = chin_drop(best)
                if res.face_blendshapes and bi < len(res.face_blendshapes):
                    jw = jaw_open(res.face_blendshapes[bi])
            values.append(round(v, 4))
            jaws.append(round(jw, 4))
            chins.append(round(ch, 4))
            i += 1
            p = min(1.0, i / float(total))
            if p - last_p >= 0.01:
                last_p = p
                sys.stderr.write("PROGRESS %.3f\n" % p)
                sys.stderr.flush()

    err = proc.stderr.read().decode("utf-8", "replace")
    proc.wait()
    if not values:
        sys.stderr.write("ERRO err.videoUnreadable|%s|%s\n" % (a.file, err.strip()[:200]))
        sys.exit(2)
    json.dump({"fps": a.fps, "open": values, "jaw": jaws, "chin": chins}, sys.stdout)


if __name__ == "__main__":
    main()
