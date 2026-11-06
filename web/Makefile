# Run from the repository root: make -f web/Makefile all
EMCC ?= emcc
CC ?= cc
NODE ?= node
PYTHON ?= python3
OUT := web/build
CORE := core/rng.c core/ship.c core/flight.c core/scene.c core/checkpoint.c core/route.c
SOUND_IDS := 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16
SOUND_FILES := $(addprefix $(OUT)/sounds/,$(addsuffix .wav,$(SOUND_IDS)))
SOUND_MANIFEST := $(OUT)/sounds/manifest.json
MENU_MUSIC := $(OUT)/sounds/menu.wav
EXPORTS := _cs_init _cs_input _cs_tick _cs_event_take _cs_stat _cs_scene_update _cs_seg_ptr _cs_seg_count _cs_pt_ptr _cs_pt_count _cs_con_ptr _cs_con_count _cs_const
JS := keymap.js input.js events.js hud.js settings.js gamepad.js music_data.js music.js synth.js sfx.js music_director.js render_gl.js cockpit.js index.html
.PHONY: all check-toolchain test test-c test-js test-sound-assets serve test-browser clean
all: check-toolchain $(OUT)/cockpit_wasm.js $(addprefix $(OUT)/,$(JS)) $(SOUND_MANIFEST) $(SOUND_FILES) $(MENU_MUSIC)
check-toolchain:
	@command -v $(EMCC) >/dev/null 2>&1 || { echo "emcc not found; activate Emscripten first."; exit 1; }
$(OUT)/cockpit_wasm.js $(OUT)/cockpit_wasm.wasm &: web/cockpit.c $(CORE) core/flight.h core/scene.h core/rng.h core/ship.h web/Makefile
	mkdir -p $(OUT)
	$(EMCC) -std=gnu11 -Wall -Wextra -O2 web/cockpit.c $(CORE) -lm -sMODULARIZE=1 -sEXPORT_NAME=createCockpit -sENVIRONMENT=web -sFILESYSTEM=0 \
	  -sEXPORTED_RUNTIME_METHODS='["HEAPF32"]' -sEXPORTED_FUNCTIONS='[$(foreach e,$(EXPORTS),"$(e)",)"_malloc"]' -o $(OUT)/cockpit_wasm.js
$(addprefix $(OUT)/,$(JS)): $(OUT)/%: web/%
	mkdir -p $(OUT)
	cp $< $@
$(SOUND_MANIFEST) $(SOUND_FILES) $(MENU_MUSIC) &: web/make_sounds.py web/audio.h
	$(PYTHON) web/make_sounds.py --output $(OUT)/sounds
test: test-c test-js test-sound-assets
test-c:
	@tmp=$$(mktemp -d) || exit 1; trap 'rm -rf "$$tmp"' EXIT HUP INT TERM; \
	$(CC) -std=c11 -Wall -Wextra -Werror -O2 -fsanitize=address,undefined $(CORE) core/test_core.c -lm -o "$$tmp/core" && "$$tmp/core" && \
	$(CC) -std=c11 -Wall -Wextra -Werror -O2 -fsanitize=address,undefined $(CORE) core/test_checkpoint.c -lm -o "$$tmp/checkpoint" && "$$tmp/checkpoint" && \
	$(CC) -std=c11 -Wall -Wextra -Werror -O2 -fsanitize=address,undefined $(CORE) core/test_route.c -lm -o "$$tmp/route" && "$$tmp/route"
test-js:
	$(NODE) --check web/cockpit.js
	$(NODE) web/test_js.js
	$(NODE) --check web/music_data.js
	$(NODE) --check web/music.js
	$(NODE) --check web/synth.js
	$(NODE) --check web/music_director.js
	$(NODE) --check web/sfx.js
	$(NODE) web/test_music.js
	$(NODE) web/test_sfx.js
test-sound-assets:
	$(PYTHON) -B web/test_sound_assets.py
serve: all
	$(PYTHON) -m http.server 8000 --bind 0.0.0.0 --directory $(OUT)
test-browser: all
	$(NODE) tools/smoke/smoke.js
clean:
	rm -rf $(OUT)
