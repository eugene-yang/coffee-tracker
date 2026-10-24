#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10"]
# ///
"""Eyeball test: extract coffee-bag metadata from photos with a local Ollama VLM.

Usage:
    ./extract_beans.py ./pic/DS*.jpg
    ./extract_beans.py --model gemma4:e4b ./pic/*.jpg > results.md

Prints a markdown table to stdout; progress/timing goes to stderr.
"""

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image, ImageOps

FIELDS = [
    ("roaster", "Roaster"),
    ("coffee_name", "Name"),
    ("origin", "Origin"),
    ("producer", "Producer/Farm"),
    ("variety", "Variety"),
    ("process", "Process"),
    ("roast_level", "Roast"),
    ("altitude", "Altitude"),
    ("tasting_notes", "Tasting notes"),
    ("roast_date", "Roast date"),
    ("weight", "Weight"),
    ("other_notes", "Other notes"),
]

SCHEMA = {
    "type": "object",
    "properties": {
        k: ({"type": "array", "items": {"type": "string"}} if k == "tasting_notes" else {"type": "string"})
        for k, _ in FIELDS
    },
    "required": [k for k, _ in FIELDS],
}

PROMPT = """You are reading the label of a specialty coffee bean bag in this photo.
Extract the following fields exactly as printed on the bag. Use an empty string (or empty list) if a field is not visible. Do not guess.

- roaster: roasting company name
- coffee_name: the name of this coffee / blend
- origin: country and region
- producer: farm, estate, cooperative, washing station or producer name
- variety: coffee variety / cultivar (e.g. Geisha, SL28, Caturra, Bourbon)
- process: processing method (e.g. washed, natural, honey, anaerobic)
- roast_level: roast level or intended use (e.g. light, medium, filter, espresso, omni)
- altitude: growing altitude including units (e.g. "1900-2100 masl")
- tasting_notes: list of flavor notes listed by the roaster
- roast_date: roast date as printed
- weight: net weight as printed
- other_notes: anything else useful (harvest, lot, certifications, brewing suggestions)

Respond with JSON only."""


def load_image_b64(path: str, max_side: int) -> str:
    img = ImageOps.exif_transpose(Image.open(path))  # phone/camera photos are often rotated
    img = img.convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def extract(path: str, args) -> dict:
    payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": PROMPT, "images": [load_image_b64(path, args.max_side)]}],
        "format": SCHEMA,
        "stream": False,
        "think": args.think,
        "options": {"temperature": 0},
    }
    req = urllib.request.Request(
        f"{args.host.rstrip('/')}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=args.timeout) as resp:
        body = json.load(resp)
    return json.loads(body["message"]["content"])


def cell(value) -> str:
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value)
    value = str(value or "").replace("|", "\\|").replace("\n", " ").strip()
    return value or "—"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("images", nargs="+", help="image files (e.g. ./pic/DS*.jpg)")
    p.add_argument("--model", default="qwen3.5:4b")
    p.add_argument("--host", default=os.environ.get("OLLAMA_HOST", "http://localhost:11434"))
    p.add_argument("--max-side", type=int, default=1536, help="downscale longest side to this many px")
    p.add_argument("--think", action="store_true", help="enable model thinking (slower, sometimes more accurate)")
    p.add_argument("--timeout", type=int, default=300)
    args = p.parse_args()
    if not args.host.startswith("http"):
        args.host = f"http://{args.host}"

    print(f"Model: `{args.model}`\n")
    print("| File | " + " | ".join(h for _, h in FIELDS) + " | Time |")
    print("|" + "---|" * (len(FIELDS) + 2))
    for i, path in enumerate(args.images, 1):
        print(f"[{i}/{len(args.images)}] {path} ...", file=sys.stderr, end=" ", flush=True)
        t0 = time.time()
        try:
            data = extract(path, args)
            row = [cell(data.get(k)) for k, _ in FIELDS]
        except Exception as e:  # keep going so one bad image doesn't kill the batch
            row = [f"ERROR: {cell(e)}"] + [""] * (len(FIELDS) - 1)
        dt = time.time() - t0
        print(f"{dt:.1f}s", file=sys.stderr)
        print(f"| {cell(os.path.basename(path))} | " + " | ".join(row) + f" | {dt:.1f}s |", flush=True)


if __name__ == "__main__":
    main()
