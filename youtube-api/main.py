import os
import re
import shutil
import tempfile
from urllib.parse import urlparse

from flask import Flask, jsonify, request, send_file
from pytubefix import YouTube

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


def valid_youtube_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()
        allowed = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
        return parsed.scheme in {"http", "https"} and host in allowed and not parsed.username and not parsed.password
    except Exception:
        return False


def read_url():
    data = request.get_json(silent=True) or {}
    url = data.get("url")
    if not valid_youtube_url(url):
        return None, (jsonify({"error": "Invalid YouTube URL."}), 400)
    return url, None


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "DL Hub YouTube API"})


@app.post("/video_info")
def video_info():
    url, error = read_url()
    if error:
        return error
    try:
        yt = YouTube(url)
        return jsonify({
            "title": yt.title,
            "author": yt.author,
            "length": yt.length,
            "views": yt.views,
            "description": yt.description,
            "publish_date": yt.publish_date.isoformat() if yt.publish_date else None
        })
    except Exception:
        app.logger.exception("YouTube info request failed")
        return jsonify({"error": "Could not read video information. Try another public video."}), 502


@app.post("/available_resolutions")
def available_resolutions():
    url, error = read_url()
    if error:
        return error
    try:
        yt = YouTube(url)
        resolutions = sorted(
            {s.resolution for s in yt.streams.filter(progressive=True, file_extension="mp4") if s.resolution},
            key=lambda value: int(value.rstrip("p"))
        )
        return jsonify({"progressive": resolutions, "all": resolutions})
    except Exception:
        app.logger.exception("YouTube resolution lookup failed")
        return jsonify({"error": "Could not list available MP4 qualities."}), 502


@app.post("/download/<resolution>")
def download_by_resolution(resolution):
    url, error = read_url()
    if error:
        return error
    if not re.fullmatch(r"\d{3,4}p", resolution):
        return jsonify({"error": "Invalid resolution."}), 400

    temp_dir = tempfile.mkdtemp(prefix="dlhub-")
    try:
        yt = YouTube(url)
        stream = yt.streams.filter(
            progressive=True, file_extension="mp4", resolution=resolution
        ).first()
        if stream is None:
            shutil.rmtree(temp_dir, ignore_errors=True)
            return jsonify({"error": "This MP4 quality with audio is not available for this video."}), 404

        downloaded_path = stream.download(output_path=temp_dir, filename="video.mp4")
        response = send_file(
            downloaded_path,
            mimetype="video/mp4",
            as_attachment=True,
            download_name="DL-Hub-video-" + resolution + ".mp4",
            conditional=True
        )
        response.call_on_close(lambda: shutil.rmtree(temp_dir, ignore_errors=True))
        return response
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        app.logger.exception("YouTube download failed")
        return jsonify({"error": "Download failed. The source may be unavailable or the service may need an update."}), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
