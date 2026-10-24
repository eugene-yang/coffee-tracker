"""Photo files: normalized full image + square thumbnail, keyed by the client-generated photo id."""

import hashlib
import io
import re
from pathlib import Path

from PIL import Image, ImageOps

FULL_MAX_SIDE = 2000
THUMB_SIDE = 240
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class InvalidPhoto(ValueError):
    pass


def paths(photo_dir: Path, photo_id: str) -> dict[str, Path]:
    return {"full": photo_dir / f"{photo_id}.jpg", "thumb": photo_dir / f"{photo_id}.thumb.webp"}


def store(photo_dir: Path, photo_id: str, data: bytes) -> dict:
    """Validate, normalize and save an uploaded image. Returns metadata for the photo row."""
    if not ID_RE.match(photo_id):
        raise InvalidPhoto("bad photo id")
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidPhoto("photo too large")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")  # phone photos are often rotated
    except Exception as e:
        raise InvalidPhoto(f"not an image: {e}") from e

    photo_dir.mkdir(parents=True, exist_ok=True)
    p = paths(photo_dir, photo_id)
    full = img.copy()
    full.thumbnail((FULL_MAX_SIDE, FULL_MAX_SIDE))
    _atomic_save(full, p["full"], "JPEG", quality=88)
    # Square center crop: inventory tiles are square
    thumb = ImageOps.fit(img, (THUMB_SIDE, THUMB_SIDE), method=Image.Resampling.LANCZOS)
    _atomic_save(thumb, p["thumb"], "WEBP", quality=80)
    return {"sha256": hashlib.sha256(data).hexdigest(), "width": full.width, "height": full.height}


def _atomic_save(img: Image.Image, path: Path, fmt: str, **kwargs) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    img.save(tmp, fmt, **kwargs)
    tmp.replace(path)
