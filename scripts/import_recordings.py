"""Turns real voice recordings (phone memos, WhatsApp notes: any format ffmpeg reads) into site clips.

    python scripts/import_recordings.py <folder>

Each file must be named after its line key (placed.m4a, welcome.ogg …). Silence is trimmed, volume
levelled, and the clip saved as web/public/voice/hr/<key>.mp3; the key is added to "recorded" in
web/voice-lines.json so the Voice clips Action never overwrites a human recording.
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / "web" / "voice-lines.json"
OUT = ROOT / "web" / "public" / "voice" / "hr"
CLEAN = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11"

data = json.loads(LINES.read_text(encoding="utf-8"))
done = []
for f in sorted(pathlib.Path(sys.argv[1]).iterdir()):
    key = f.stem
    if key not in data["lines"]:
        print("skip (no such line):", f.name)
        continue
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-af", CLEAN, "-ac", "1", "-ar", "44100", "-b:a", "96k", str(OUT / f"{key}.mp3")], check=True)
    done.append(key)
data["recorded"] = sorted(set(data.get("recorded", [])) | set(done))
LINES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("imported:", ", ".join(done) or "nothing")
