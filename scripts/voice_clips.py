"""Records every line in web/voice-lines.json as an MP3 with a Microsoft neural voice (free, via edge-tts).

Only lines whose text or voice changed are recorded again; web/public/voice/hr/manifest.json remembers
what each clip was made from. Run by the "Voice clips" GitHub Action, or locally:
    pip install edge-tts && python scripts/voice_clips.py
"""
import asyncio, hashlib, json, pathlib, sys

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / "web" / "voice-lines.json"
OUT = ROOT / "web" / "public" / "voice" / "hr"
MANIFEST = OUT / "manifest.json"
RATE = "-6%"  # a touch slower than default sounds friendlier on a phone speaker


async def main(force: bool) -> None:
    data = json.loads(LINES.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    seen = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    made = 0
    for key, line in data["lines"].items():
        voice = data["voices"][line["voice"]]
        sig = hashlib.sha1(f"{voice}|{RATE}|{line['text']}".encode()).hexdigest()
        path = OUT / f"{key}.mp3"
        if not force and seen.get(key) == sig and path.exists():
            continue
        await edge_tts.Communicate(line["text"], voice, rate=RATE).save(str(path))
        seen[key] = sig
        made += 1
        print(f"recorded {key} ({voice})")
    for stale in set(seen) - set(data["lines"]):
        (OUT / f"{stale}.mp3").unlink(missing_ok=True)
        del seen[stale]
    MANIFEST.write_text(json.dumps(seen, indent=2, sort_keys=True) + "\n")
    print(f"{made} clip(s) recorded")


asyncio.run(main("--force" in sys.argv))
