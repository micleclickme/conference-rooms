UUID := conference-rooms@micleclickme.github.io
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SHELL := /bin/bash

SCHEMA_FILES := $(wildcard schemas/*.gschema.xml)
PO_FILES := $(wildcard po/*.po)
MO_FILES := $(patsubst po/%.po,locale/%/LC_MESSAGES/conference-rooms.mo,$(PO_FILES))

.PHONY: all schemas pot mo test install uninstall pack clean

all: schemas mo

schemas: schemas/gschemas.compiled

schemas/gschemas.compiled: $(SCHEMA_FILES)
	glib-compile-schemas schemas/

test:
	gjs -m tests/run.js

pot:
	xgettext --from-code=UTF-8 --output=po/conference-rooms.pot \
		--keyword=_ --keyword=N_ \
		--package-name="Conference Rooms" \
		$$(find . -name '*.js' -not -path './tests/*' -not -path './locale/*')

mo: $(MO_FILES)

locale/%/LC_MESSAGES/conference-rooms.mo: po/%.po
	mkdir -p $(dir $@)
	msgfmt $< -o $@

install: all
	mkdir -p "$(INSTALL_DIR)"
	cp -r metadata.json extension.js prefs.js stylesheet.css lib schemas icons locale "$(INSTALL_DIR)/"

uninstall:
	rm -rf "$(INSTALL_DIR)"

pack: all
	@test -d locale || { echo "locale/ missing — run 'make mo' first"; exit 1; }
	rm -f $(UUID).shell-extension.zip
	cd . && zip -r $(UUID).shell-extension.zip \
		metadata.json extension.js prefs.js stylesheet.css \
		lib schemas icons locale

clean:
	rm -f schemas/gschemas.compiled
	rm -rf locale
	rm -f *.zip
