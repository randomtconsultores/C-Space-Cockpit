import json
from pathlib import Path
import re
import struct
import tempfile
import unittest
import wave

from make_sounds import MENU_MELODY, MENU_STEP_SECONDS, RATE, SOUNDS, build


class SoundAssetsTest(unittest.TestCase):
    def test_event_contract(self):
        header = Path(__file__).with_name("audio.h").read_text(encoding="utf-8")
        actual = {name: int(value) for name, value in re.findall(
            r"WEB_AUDIO_([A-Z_]+)\s*=\s*(\d+)", header)
            if name not in ("NONE", "EVENT_COUNT")}
        expected = {sound[0]: event for event, sound in enumerate(SOUNDS, 1)}
        self.assertEqual(actual, expected)
        self.assertEqual(len(expected), 16)

    def test_wav_files_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a", Path(tmp) / "b"
            build(a)
            build(b)
            manifest = json.loads((a / "manifest.json").read_text())
            self.assertEqual(set(manifest), {str(i) for i in range(1, 17)})
            self.assertEqual(len(list(a.glob("[0-9]*.wav"))), 16)
            menu_a = a / "menu.wav"
            menu_b = b / "menu.wav"
            self.assertEqual(menu_a.read_bytes(), menu_b.read_bytes())
            with wave.open(str(menu_a), "rb") as wav:
                self.assertEqual(wav.getnchannels(), 1)
                self.assertEqual(wav.getsampwidth(), 2)
                self.assertEqual(wav.getframerate(), RATE)
                self.assertEqual(wav.getnframes(), int(RATE * MENU_STEP_SECONDS * len(MENU_MELODY)))
                self.assertGreater(max(abs(x) for x in struct.unpack(
                    "<" + "h" * wav.getnframes(), wav.readframes(wav.getnframes()))), 0)
            for event, sound in enumerate(SOUNDS, 1):
                entry = manifest[str(event)]
                self.assertEqual(entry, {"name": sound[0], "src": str(event) + ".wav"})
                path = a / entry["src"]
                self.assertEqual(path.read_bytes(), (b / entry["src"]).read_bytes())
                with wave.open(str(path), "rb") as wav:
                    self.assertEqual(wav.getnchannels(), 1)
                    self.assertEqual(wav.getsampwidth(), 2)
                    self.assertEqual(wav.getframerate(), RATE)
                    self.assertEqual(wav.getnframes(), int(RATE * sound[2]))
                    raw = wav.readframes(wav.getnframes())
                samples = struct.unpack("<" + "h" * (len(raw) // 2), raw)
                self.assertEqual(samples[0], 0)
                self.assertEqual(samples[-1], 0)
                self.assertGreater(max(abs(x) for x in samples), 0)
                self.assertLess(max(abs(x) for x in samples), 32767)


if __name__ == "__main__":
    unittest.main()
