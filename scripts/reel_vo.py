"""Records the reel voice-over lines (reels/vo-lines.json) with the same Microsoft neural voices the
website uses, into reels/vo/<voice>/<film>_<n>.mp3. Run by the "Reel voice-over" GitHub Action, or:
    pip install edge-tts && python scripts/reel_vo.py
"""
import asyncio, json, pathlib

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "reels" / "vo-lines.json").read_text(encoding="utf-8"))


async def main() -> None:
    for name, spec in DATA["voices"].items():
        voice, _, pitch = spec.partition("|")
        out = ROOT / "reels" / "vo" / name
        out.mkdir(parents=True, exist_ok=True)
        for film, lines in DATA["films"].items():
            for i, (_, text) in enumerate(lines):
                await edge_tts.Communicate(text, voice, rate=DATA["rate"], pitch=pitch or "+0Hz").save(str(out / f"{film}_{i}.mp3"))
                print(f"recorded {name} {film}_{i}")


asyncio.run(main())
