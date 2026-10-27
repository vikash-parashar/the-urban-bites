"""Records the same Haryanvi line in several male voices so Vikash can pick one. Output: voice-samples/*.mp3"""
import asyncio, pathlib

import edge_tts

OUT = pathlib.Path(__file__).resolve().parent.parent / "voice-samples"
TEXT = "राम राम जी! द अर्बन बाइट्स पै ऑर्डर करण खातर घणा धन्यवाद। थारा ऑर्डर मिल ग्या सै, सारी खबर इसे पेज पै मिलती रहवैगी।"
SAMPLES = [
    ("1-madhur", "hi-IN-MadhurNeural", "+22%", "+0Hz"),
    ("2-madhur-deep", "hi-IN-MadhurNeural", "+18%", "-12Hz"),
    ("3-manohar", "mr-IN-ManoharNeural", "+15%", "+0Hz"),
    ("4-sagar", "ne-NP-SagarNeural", "+15%", "+0Hz"),
    ("5-andrew", "en-US-AndrewMultilingualNeural", "+12%", "+0Hz"),
]


async def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, voice, rate, pitch in SAMPLES:
        try:
            await edge_tts.Communicate(TEXT, voice, rate=rate, pitch=pitch).save(str(OUT / f"{name}.mp3"))
            print("recorded", name, voice)
        except Exception as e:  # one voice failing shouldn't stop the rest
            print("failed", name, voice, e)


asyncio.run(main())
