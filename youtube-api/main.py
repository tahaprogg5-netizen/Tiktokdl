import os
import re
import shutil
import tempfile
from datetime import datetime

import yt_dlp
from flask import Flask, jsonify, request, send_file

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


def normalize_youtube_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(value.strip())
        host = (parsed.hostname or "").lower()
        allowed = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
        if parsed.scheme not in {"http", "https"} or host not in allowed or parsed.username or parsed.password:
            return None
        if host.endswith("youtu.be"):
            video_id = parsed.path.strip("/").split("/")[0]
        elif parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        else:
            parts = [part for part in parsed.path.split("/") if part]
            video_id = parts[1] if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"} else ""
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            return None
        return "https://www.youtube.com/watch?v=" + video_id
    except Exception:
        return None


def read_url():
    data = request.get_json(silent=True) or {}
    url = normalize_youtube_url(data.get("url"))
    if not url:
        return None, (jsonify({"error": "لینک معتبر YouTube وارد کن.", "code": "invalid_url"}), 400)
    return url, None


def ydl_options(extra=None):
    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 25,
        "retries": 2,
        "extractor_retries": 2,
        "fragment_retries": 2,
        "skip_download": True,
    }
    if extra:
        options.update(extra)
    return options


def extract_video(url):
    with yt_dlp.YoutubeDL(ydl_options()) as ydl:
        return ydl.extract_info(url, download=False)


def progressive_resolutions(info):
    heights = set()
    for item in info.get("formats") or []:
        if (
            item.get("ext") == "mp4"
            and item.get("vcodec") not in (None, "none")
            and item.get("acodec") not in (None, "none")
            and isinstance(item.get("height"), int)
        ):
            heights.add(item["height"])
    return [f"{height}p" for height in sorted(heights)]


@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "service": "DL Hub YouTube API",
        "engine": "yt-dlp",
        "engine_version": yt_dlp.version.__version__,
    })


@app.post("/video_info")
def video_info():
    url, error = read_url()
    if error:
        return error
    try:
        info = extract_video(url)
        return jsonify({
            "id": info.get("id"),
            "title": info.get("title") or "YouTube video",
            "author": info.get("uploader") or info.get("channel") or "",
            "length": info.get("duration") or 0,
            "views": info.get("view_count") or 0,
            "description": (info.get("description") or "")[:2000],
            "publish_date": info.get("upload_date") or None,
            "progressive": progressive_resolutions(info),
        })
    except Exception as exc:
        app.logger.exception("YouTube info request failed")
        return jsonify({
            "error": "اطلاعات ویدیو از یوتیوب دریافت نشد.",
            "code": "youtube_extract_failed",
            "detail": (str(exc) or type(exc).__name__)[:300],
        }), 502


@app.post("/available_resolutions")
def available_resolutions():
    url, error = read_url()
    if error:
        return error
    try:
        info = extract_video(url)
        values = progressive_resolutions(info)
        return jsonify({"progressive": values, "all": values})
    except Exception as exc:
        app.logger.exception("YouTube resolution lookup failed")
        return jsonify({
            "error": "کیفیت‌های ویدیو دریافت نشد.",
            "code": "youtube_formats_failed",
            "detail": (str(exc) or type(exc).__name__)[:300],
        }), 502


@app.post("/download/<resolution>")
def download_by_resolution(resolution):
    url, error = read_url()
    if error:
        return error
    if not re.fullmatch(r"\d{3,4}p", resolution):
        return jsonify({"error": "کیفیت انتخاب‌شده معتبر نیست.", "code": "invalid_resolution"}), 400

    height = int(resolution[:-1])
    temp_dir = tempfile.mkdtemp(prefix="dlhub-")
    try:
        output_template = os.path.join(temp_dir, "video.%(ext)s")
        options = ydl_options({
            "skip_download": False,
            "format": f"best[ext=mp4][height={height}][acodec!=none][vcodec!=none]",
            "outtmpl": output_template,
            "overwrites": True,
        })
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
            downloaded_path = ydl.prepare_filename(info)

        if not os.path.isfile(downloaded_path) or os.path.getsize(downloaded_path) == 0:
            raise RuntimeError("download_file_missing")

        response = send_file(
            downloaded_path,
            mimetype="video/mp4",
            as_attachment=True,
            download_name=f"DL-Hub-video-{resolution}.mp4",
            conditional=True,
        )
        response.call_on_close(lambda: shutil.rmtree(temp_dir, ignore_errors=True))
        return response
    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        app.logger.exception("YouTube download failed")
        return jsonify({
            "error": "دانلود ویدیو انجام نشد.",
            "code": "youtube_download_failed",
            "detail": (str(exc) or type(exc).__name__)[:300],
        }), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
