import os, re, json, uuid, shutil, subprocess
from difflib import SequenceMatcher
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from flask import Flask, render_template, request, jsonify, send_from_directory

BASE = Path(__file__).resolve().parent
UPLOADS = BASE / "uploads"
REPORTS = BASE / "reports"
UPLOADS.mkdir(exist_ok=True)
REPORTS.mkdir(exist_ok=True)
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024
ALLOWED = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
NODE_USAGE_URL = os.environ.get("NODE_USAGE_URL", "http://127.0.0.1:3000").rstrip("/")
ADVANCED_USAGE_BUSY = set()


def consume_dyslexia_quota():
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    auth = request.headers.get("Authorization")
    cookie = request.headers.get("Cookie")
    if auth:
        headers["Authorization"] = auth
    if cookie:
        headers["Cookie"] = cookie
    req = Request(
        NODE_USAGE_URL + "/api/dyslexia/consume",
        data=b'{"action":"advanced"}',
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8") or "{}")
            return True, payload, 200
    except HTTPError as e:
        raw = e.read().decode("utf-8") if e.fp else "{}"
        try:
            payload = json.loads(raw or "{}")
        except Exception:
            payload = {"error": "امکان انجام تحلیل وجود ندارد."}
        if not payload.get("error"):
            payload["error"] = "امکان انجام تحلیل وجود ندارد."
        return False, payload, e.code or 403
    except URLError:
        return False, {"error": "ارتباط با سامانه سهمیه برقرار نشد."}, 503
    except Exception:
        return False, {"error": "خطا در ثبت مصرف سهمیه تحلیل."}, 500


ASR_MODEL_CACHE = {}


def clean(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s or "audio")


def save(f):
    if not f or not f.filename:
        raise ValueError("فایل انتخاب نشده است.")
    ext = Path(f.filename).suffix.lower()
    if ext not in ALLOWED:
        raise ValueError("این فرمت صوتی پشتیبانی نمی‌شود.")
    name = f"{uuid.uuid4().hex}_{clean(Path(f.filename).stem)}{ext}"
    f.save(UPLOADS / name)
    return name


def ffmpeg():
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def wavify(name):
    src = UPLOADS / name
    if src.suffix.lower() == ".wav":
        return name
    exe = ffmpeg()
    if not exe:
        raise RuntimeError("مبدل صوتی در دسترس نیست. لطفاً imageio-ffmpeg را نصب کنید.")
    out = f"{uuid.uuid4().hex}_16k.wav"
    p = subprocess.run(
        [
            exe,
            "-y",
            "-i",
            str(src),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            str(UPLOADS / out),
        ],
        capture_output=True,
        text=True,
    )
    if p.returncode:
        raise RuntimeError("تبدیل فایل صوتی ناموفق بود: " + p.stderr[-500:])
    return out


def wav_info(path):
    import wave

    with wave.open(str(path), "rb") as w:
        return {
            "duration": w.getnframes() / w.getframerate(),
            "sr": w.getframerate(),
            "channels": w.getnchannels(),
        }


def words(text):
    return re.findall(r"\S+", text.strip())


def auto_word_times(speech, word_list):
    if not word_list or not speech:
        return [
            {"index": i, "word": w, "start": None, "end": None, "confirmed": True}
            for i, w in enumerate(word_list)
        ]
    active = [(float(a), float(b)) for a, b in speech if b > a]
    total_active = sum(b - a for a, b in active)
    if total_active <= 0:
        return [
            {"index": i, "word": w, "start": None, "end": None, "confirmed": True}
            for i, w in enumerate(word_list)
        ]
    weights = [max(1, len(re.sub(r"[^\wآ-ی]", "", w))) for w in word_list]
    total_weight = float(sum(weights))
    cumulative = [0.0]
    for wt in weights:
        cumulative.append(cumulative[-1] + total_active * wt / total_weight)

    def active_to_audio(pos):
        left = min(max(0.0, pos), total_active)
        for a, b in active:
            dur = b - a
            if left <= dur:
                return a + left
            left -= dur
        return active[-1][1]

    out = []
    for i, w in enumerate(word_list):
        st = active_to_audio(cumulative[i])
        en = active_to_audio(cumulative[i + 1])
        out.append(
            {
                "index": i,
                "word": w,
                "start": round(st, 3),
                "end": round(en, 3),
                "confirmed": True,
            }
        )
    return out


def basic_vad(path):
    import wave, numpy as np

    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw != 2:
        raise RuntimeError("فایل WAV باید PCM 16-bit باشد.")
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(1)
    if len(x) == 0:
        return [], []
    frame = max(1, int(0.025 * sr))
    hop = max(1, int(0.01 * sr))
    rms = []
    for i in range(0, max(1, len(x) - frame), hop):
        rms.append(np.sqrt(np.mean(x[i : i + frame] ** 2) + 1e-10))
    db = 20 * np.log10(np.maximum(rms, 1e-7))
    th = max(np.percentile(db, 20) + 8, np.percentile(db, 95) - 38)
    act = db > th
    minrun = max(3, int(0.08 / (hop / sr)))
    gap = max(1, int(0.12 / (hop / sr)))
    i = 0
    while i < len(act):
        if act[i]:
            i += 1
            continue
        j = i
        while j < len(act) and not act[j]:
            j += 1
        if j - i <= gap:
            act[i:j] = True
        i = j
    spans = []
    i = 0
    while i < len(act):
        if not act[i]:
            i += 1
            continue
        j = i
        while j < len(act) and act[j]:
            j += 1
        if j - i >= minrun:
            spans.append((i * hop / sr, min(len(x) / sr, (j * hop + frame) / sr)))
        i = j
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < 0.15:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    pauses = [
        (merged[i][1], merged[i + 1][0])
        for i in range(len(merged) - 1)
        if merged[i + 1][0] - merged[i][1] >= 0.12
    ]
    return merged, pauses


def transcribe_farsi(path):
    """ASR is auxiliary evidence only. Returned words are editable and are not used as the reference text."""
    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        app.logger.exception("faster-whisper import failed")
        raise RuntimeError(
            f"خطای بارگذاری faster-whisper: {type(e).__name__}: {e}"
        ) from e
    model_name = "small"
    if model_name not in ASR_MODEL_CACHE:
        ASR_MODEL_CACHE[model_name] = WhisperModel(
            model_name, device="cpu", compute_type="int8"
        )
    model = ASR_MODEL_CACHE[model_name]
    segments, info = model.transcribe(
        str(path), language="fa", word_timestamps=True, vad_filter=True, beam_size=5
    )
    out = []
    for seg in segments:
        seg_words = getattr(seg, "words", None) or []
        for w in seg_words:
            txt = (w.word or "").strip()
            if not txt:
                continue
            out.append(
                {
                    "index": len(out),
                    "word": txt,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "ref_index": None,
                    "confirmed": True,
                    "error_type": "بدون خطا",
                    "note": "",
                }
            )
    if not out:
        # Fallback to segment-level tokens if the installed model produced no word timestamps.
        for seg in segments:
            for txt in words(seg.text or ""):
                out.append(
                    {
                        "index": len(out),
                        "word": txt,
                        "start": round(float(seg.start), 3),
                        "end": round(float(seg.end), 3),
                        "ref_index": None,
                        "confirmed": True,
                        "error_type": "بدون خطا",
                        "note": "",
                    }
                )
    return {
        "text": " ".join(x["word"] for x in out),
        "words": out,
        "language": getattr(info, "language", "fa"),
    }


@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/advanced")
def advanced():
    key = (
        request.headers.get("Authorization")
        or request.headers.get("Cookie")
        or request.remote_addr
        or "anon"
    )
    if key in ADVANCED_USAGE_BUSY:
        return (
            jsonify(error="درخواست قبلی سهمیه هنوز تمام نشده است. لطفاً صبر کنید."),
            429,
        )
    ADVANCED_USAGE_BUSY.add(key)
    try:
        ok, payload, status = consume_dyslexia_quota()
        if not ok:
            return (
                jsonify(
                    ok=False,
                    code=payload.get("code"),
                    error=payload.get("error", "امکان انجام تحلیل وجود ندارد."),
                ),
                status,
            )
        return jsonify(
            ok=True,
            usageCount=payload.get("usageCount"),
            usageLimit=payload.get("usageLimit"),
            usageRemaining=payload.get("usageRemaining"),
        )
    finally:
        ADVANCED_USAGE_BUSY.discard(key)


DYSLEXIA_SESSIONS = {}


@app.post("/api/analyze")
def analyze():
    cleanup_id = request.form.get("cleanup_id", "").strip()
    uploaded_files = []

    try:
        ref = request.form.get("reference", "").strip()
        if not ref:
            return jsonify(error="متن مرجع را وارد کنید."), 400

        original_n = save(request.files.get("normal_audio"))
        uploaded_files.append(original_n)
        n = wavify(original_n)
        if n not in uploaded_files:
            uploaded_files.append(n)

        original_t = save(request.files.get("test_audio"))
        uploaded_files.append(original_t)
        t = wavify(original_t)
        if t not in uploaded_files:
            uploaded_files.append(t)

        nw = words(ref)
        result = {
            "id": uuid.uuid4().hex,
            "reference_words": nw,
            "normal": {},
            "test": {},
        }

        for key, name in [("normal", n), ("test", t)]:
            info = wav_info(UPLOADS / name)
            speech, pauses = basic_vad(UPLOADS / name)
            result[key] = {
                "file": name,
                "duration": info["duration"],
                "speech": speech,
                "pauses": pauses,
                "words": auto_word_times(speech, nw),
            }

        result["test_transcription"] = transcribe_farsi(UPLOADS / t)

        report_name = result["id"] + ".json"
        (REPORTS / report_name).write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf8",
        )

        if cleanup_id:
            session_data = DYSLEXIA_SESSIONS.setdefault(
                cleanup_id, {"uploads": set(), "reports": set()}
            )
            session_data["uploads"].update(uploaded_files)
            session_data["reports"].add(report_name)

        return jsonify(result)

    except Exception as e:
        app.logger.exception("خطا هنگام تحلیل فایل صوتی")
        return jsonify(error=str(e)), 500

    finally:
        # فایل‌های صوتی در این مرحله باقی می‌مانند تا بتوانیم
        # در مرحله پاک‌سازی نشست، آن‌ها را حذف کنیم.
        pass


@app.post("/api/save")
def save_result():
    d = request.get_json(force=True)
    rid = d.get("id") or uuid.uuid4().hex
    cleanup_id = str(d.get("cleanup_id", "")).strip()

    report_name = rid + "_corrected.json"
    (REPORTS / report_name).write_text(
        json.dumps(d, ensure_ascii=False, indent=2),
        encoding="utf8",
    )

    if cleanup_id:
        session_data = DYSLEXIA_SESSIONS.setdefault(
            cleanup_id, {"uploads": set(), "reports": set()}
        )
        session_data["reports"].add(report_name)

    return jsonify(ok=True)


@app.post("/api/cleanup")
def cleanup_dyslexia_session():
    data = request.get_json(silent=True) or {}
    cleanup_id = str(data.get("cleanup_id", "")).strip()

    if not cleanup_id or len(cleanup_id) > 100:
        return jsonify(ok=False, error="شناسه نشست نامعتبر است."), 400

    session_data = DYSLEXIA_SESSIONS.pop(cleanup_id, None)

    if session_data is None:
        return jsonify(ok=True, deleted=0)

    deleted = 0

    for folder, filenames in (
        (UPLOADS, session_data["uploads"]),
        (REPORTS, session_data["reports"]),
    ):
        for filename in filenames:
            # فقط نام فایل ثبت‌شده را قبول می‌کنیم، نه مسیر دلخواه
            if Path(filename).name != filename:
                continue

            try:
                (folder / filename).unlink(missing_ok=True)
                deleted += 1
            except OSError:
                app.logger.exception("حذف فایل نشست ناموفق بود: %s", filename)

    return jsonify(ok=True, deleted=deleted)


@app.post("/api/retime")
def retime_result():
    """Re-read the saved test audio with word timestamps and re-associate edited rows.
    For one original ASR word replaced by several edited rows (e.g. syllables/phoneme-like
    pieces), its acoustic interval is split proportionally across the edited pieces.
    This is still ASR timestamp alignment, not phoneme-level forced alignment.
    """
    try:
        d = request.get_json(force=True) or {}
        rid = d.get("id")
        items = d.get("items")
        if items is None:
            items = [{"word": str(x)} for x in (d.get("words") or [])]
        items = [x for x in items if str(x.get("word", "")).strip()]
        if not rid:
            return jsonify(error="شناسه تحلیل موجود نیست."), 400
        src = REPORTS / (str(rid) + ".json")
        if not src.exists():
            return jsonify(error="فایل تحلیل اولیه پیدا نشد."), 404
        base = json.loads(src.read_text(encoding="utf8"))
        test_file = (base.get("test") or {}).get("file")
        if not test_file or not (UPLOADS / test_file).exists():
            return jsonify(error="فایل صوتی مراجع پیدا نشد."), 404

        # Re-read the actual uploaded/converted audio. If Whisper is unavailable,
        # use the original timestamps as a controlled fallback instead of losing edits.
        original = []
        source = "original_asr_timestamps"
        try:
            fresh = transcribe_farsi(UPLOADS / test_file)
            original = fresh.get("words") or []
            source = "fresh_asr_timestamps"
        except Exception:
            original = (base.get("test_transcription") or {}).get("words") or []
        if not original:
            original = (base.get("test_transcription") or {}).get("words") or []
        if not original:
            # No ASR timestamps: preserve user-entered intervals where possible.
            out = []
            for i, x in enumerate(items):
                out.append(
                    {
                        "index": i,
                        "word": str(x.get("word", "")).strip(),
                        "start": x.get("start"),
                        "end": x.get("end"),
                        "ref_index": x.get("ref_index"),
                        "confirmed": True,
                        "error_type": x.get("error_type", "بدون خطا"),
                        "note": x.get("note", ""),
                        "is_new": False,
                        "timing_source": "manual_or_unavailable",
                    }
                )
            return jsonify(words=out, source="manual_or_unavailable")

        edited = [str(x.get("word", "")).strip() for x in items]
        ow = [str(x.get("word", "")).strip() for x in original]
        preserve_timing = bool(d.get("preserve_timing"))
        if preserve_timing:
            out = []
            for i, x in enumerate(items):
                st = x.get("start")
                en = x.get("end")
                valid = False
                try:
                    valid = (
                        st is not None
                        and en is not None
                        and float(en) > float(st)
                        and float(st) >= 0
                    )
                except Exception:
                    valid = False
                if valid:
                    out.append(
                        {
                            "index": i,
                            "word": str(x.get("word", "")).strip(),
                            "start": round(float(st), 3),
                            "end": round(float(en), 3),
                            "ref_index": x.get("ref_index"),
                            "confirmed": True,
                            "error_type": x.get("error_type", "بدون خطا"),
                            "note": x.get("note", ""),
                            "is_new": False,
                            "timing_source": "user_confirmed_test_audio_interval",
                        }
                    )
                else:
                    out.append(None)
            # Fill only rows without a valid user-confirmed interval from fresh ASR timing.
            if any(v is None for v in out):
                # Continue below using the fresh ASR alignment only for missing rows.
                pass
            else:
                return jsonify(words=out, source="user_confirmed_test_audio_intervals")
        sm = SequenceMatcher(None, ow, edited, autojunk=False)
        out = [None] * len(edited)
        used = set()

        def put_interval(j, o, st, en, source_name):
            out[j] = {
                "start": round(float(st), 3) if st is not None else None,
                "end": round(float(en), 3) if en is not None else None,
                "source_index": o,
                "timing_source": source_name,
            }

        # Match blocks. Equal-size replacements keep original boundaries.
        # If one audio word is edited into multiple pieces, split its interval by character length.
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for oi, ej in zip(range(i1, i2), range(j1, j2)):
                    o = original[oi]
                    put_interval(
                        ej,
                        oi,
                        o.get("start"),
                        o.get("end"),
                        (
                            "fresh_asr_timestamps"
                            if source == "fresh_asr_timestamps"
                            else source
                        ),
                    )
                    used.add(oi)
            elif tag == "replace" and i2 > i1 and j2 > j1:
                os = original[i1:i2]
                if len(os) == len(edited[j1:j2]):
                    for oi, ej in zip(range(i1, i2), range(j1, j2)):
                        o = original[oi]
                        put_interval(ej, oi, o.get("start"), o.get("end"), source)
                        used.add(oi)
                elif len(os) == 1:
                    o = os[0]
                    a = o.get("start")
                    b = o.get("end")
                    if a is not None and b is not None and b > a:
                        weights = [
                            max(1, len(re.sub(r"\W+", "", w, flags=re.UNICODE)))
                            for w in edited[j1:j2]
                        ]
                        total = sum(weights)
                        cur = float(a)
                        for k, wgt in enumerate(weights):
                            nxt = (
                                float(b)
                                if k == len(weights) - 1
                                else cur + (float(b) - float(a)) * wgt / total
                            )
                            put_interval(j1 + k, i1, cur, nxt, "split_from_audio_word")
                            cur = nxt
                        used.add(i1)
                    else:
                        for ej in range(j1, j2):
                            out[ej] = None
                else:
                    # Several source words -> several edited pieces: use proportional acoustic span.
                    a = next(
                        (
                            original[k].get("start")
                            for k in range(i1, i2)
                            if original[k].get("start") is not None
                        ),
                        None,
                    )
                    b = next(
                        (
                            original[k].get("end")
                            for k in range(i2 - 1, i1 - 1, -1)
                            if original[k].get("end") is not None
                        ),
                        None,
                    )
                    if a is not None and b is not None and b > a:
                        weights = [
                            max(1, len(re.sub(r"\W+", "", w, flags=re.UNICODE)))
                            for w in edited[j1:j2]
                        ]
                        total = sum(weights)
                        cur = float(a)
                        for k, wgt in enumerate(weights):
                            nxt = (
                                float(b)
                                if k == len(weights) - 1
                                else cur + (float(b) - float(a)) * wgt / total
                            )
                            put_interval(
                                j1 + k, None, cur, nxt, "split_from_audio_span"
                            )
                            cur = nxt
                        used.update(range(i1, i2))
            # deletes are not represented in edited rows; inserts are inferred below.

        # Fuzzy matching for rows not matched by SequenceMatcher.
        for j, w in enumerate(edited):
            if out[j] is not None:
                continue
            best = None
            for oi, o in enumerate(original):
                if oi in used:
                    continue
                score = SequenceMatcher(None, ow[oi], w, autojunk=False).ratio()
                if best is None or score > best[0]:
                    best = (score, oi)
            if best and best[0] >= 0.55:
                oi = best[1]
                o = original[oi]
                put_interval(
                    j,
                    oi,
                    o.get("start"),
                    o.get("end"),
                    (
                        "fresh_asr_fuzzy"
                        if source == "fresh_asr_timestamps"
                        else "asr_fuzzy"
                    ),
                )
                used.add(oi)

        # Infer genuinely inserted rows between known acoustic neighbors.
        for j in range(len(edited)):
            if out[j] is not None:
                continue
            left = next(
                (
                    k
                    for k in range(j - 1, -1, -1)
                    if out[k] and out[k].get("end") is not None
                ),
                None,
            )
            right = next(
                (
                    k
                    for k in range(j + 1, len(edited))
                    if out[k] and out[k].get("start") is not None
                ),
                None,
            )
            if left is not None and right is not None:
                a = float(out[left]["end"])
                b = float(out[right]["start"])
                count = sum(1 for k in range(left + 1, right) if out[k] is None)
                rank = sum(1 for k in range(left + 1, j + 1) if out[k] is None)
                st = a + (b - a) * (rank - 1) / count
                en = a + (b - a) * rank / count
            elif left is not None:
                st = float(out[left]["end"])
                en = min(
                    float((base.get("test") or {}).get("duration") or st + 0.25),
                    st + 0.25,
                )
            elif right is not None:
                en = float(out[right]["start"])
                st = max(0, en - 0.25)
            else:
                st = en = None
            out[j] = {
                "start": round(st, 3) if st is not None else None,
                "end": round(en, 3) if en is not None else None,
                "source_index": None,
                "timing_source": "inferred",
            }

        result = []
        for i, x in enumerate(items):
            q = out[i] or {}
            result.append(
                {
                    "index": i,
                    "word": edited[i],
                    "start": q.get("start"),
                    "end": q.get("end"),
                    "ref_index": x.get("ref_index"),
                    "confirmed": True,
                    "error_type": x.get("error_type", "بدون خطا"),
                    "note": x.get("note", ""),
                    "is_new": False,
                    "timing_source": q.get("timing_source", "inferred"),
                }
            )
        return jsonify(words=result, source=source)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/audio/<name>")
def audio(name):
    return send_from_directory(UPLOADS, name, conditional=True)


if __name__ == "__main__":
    app.run("127.0.0.1", 5050, debug=False)
