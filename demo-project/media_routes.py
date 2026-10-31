import io
import os
import uuid
from flask import Blueprint, abort, jsonify, request, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from storage import (
    UPLOAD_DIR, add_media, delete_media, get_media, media_count,
    note_owned, user_media_bytes,
)
from auth_routes import login_required, current_user_id

media_bp = Blueprint("media", __name__)

Image.MAX_IMAGE_PIXELS = 40_000_000

IMAGE_MAX = 8 * 1024 * 1024
VIDEO_MAX = 25 * 1024 * 1024
USER_QUOTA = 100 * 1024 * 1024
MAX_PER_NOTE = 10
MAX_SIDE = 2000


def detect(head):
    """Works out the real file type from its first bytes, ignoring the file name."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image", "jpg"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image", "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", "webp"
    if head[4:8] == b"ftyp":
        return "video", ("mov" if head[8:12] == b"qt  " else "mp4")
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "video", "webm"
    return None


def clean_image(data, ext):
    """Re-saves the picture without hidden metadata (such as GPS location) and shrinks it."""
    try:
        Image.open(io.BytesIO(data)).verify()
        img = Image.open(io.BytesIO(data))
        if ext == "gif":
            return data, "gif"
        img = ImageOps.exif_transpose(img)
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        out = io.BytesIO()
        if ext == "jpg":
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.save(out, "JPEG", quality=88, optimize=True)
        elif ext == "png":
            img.save(out, "PNG", optimize=True)
        else:
            img.save(out, "WEBP", quality=88)
        return out.getvalue(), ext
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError,
            Image.DecompressionBombError):
        raise ValueError("That picture couldn't be read")


@media_bp.route("/", methods=["POST"])
@login_required
def upload():
    user_id = current_user_id()
    note_id = request.form.get("note_id", type=int)
    file = request.files.get("file")

    if file is None or not file.filename:
        return jsonify({"error": "Choose a file first"}), 400
    if note_id is None or not note_owned(user_id, note_id):
        return jsonify({"error": "Note not found"}), 404
    if media_count(note_id) >= MAX_PER_NOTE:
        return jsonify({"error": "A note can hold 10 pictures or videos"}), 400

    data = file.stream.read(VIDEO_MAX + 1)
    if len(data) > VIDEO_MAX:
        return jsonify({"error": "That file is too large (videos up to 25 MB)"}), 413

    found = detect(data[:16])
    if found is None:
        return jsonify({"error": "Only PNG, JPG, GIF and WebP pictures, or MP4, WebM and MOV videos, are allowed"}), 400
    kind, ext = found

    if kind == "image":
        if len(data) > IMAGE_MAX:
            return jsonify({"error": "That picture is too large (up to 8 MB)"}), 413
        try:
            data, ext = clean_image(data, ext)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

    if user_media_bytes(user_id) + len(data) > USER_QUOTA:
        return jsonify({"error": "Your storage is full (100 MB). Remove something first."}), 413

    filename = uuid.uuid4().hex + "." + ext
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(data)
    return jsonify(add_media(note_id, filename, kind, len(data))), 201


@media_bp.route("/<int:media_id>/file")
@login_required
def serve(media_id):
    item = get_media(current_user_id(), media_id)
    if item is None:
        abort(404)
    response = send_from_directory(UPLOAD_DIR, item["filename"], conditional=True)
    response.headers["Cache-Control"] = "private, max-age=3600"
    response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


@media_bp.route("/<int:media_id>", methods=["DELETE"])
@login_required
def remove(media_id):
    if not delete_media(current_user_id(), media_id):
        return jsonify({"error": "File not found"}), 404
    return jsonify({"deleted": media_id})