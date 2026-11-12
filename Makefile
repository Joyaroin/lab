# CI runs these.
.PHONY: room meter resume og-image favicon setup frontend backend integration browser browser-light facts
room:
	blender -b -P tools/room/build.py -- --out src/assets/room.glb
	blender -b -P tools/room/resize.py -- src/assets/room.glb --size 2048
# Renders the meter bar's images with a local browser that has WebGL. Run on purpose, through heavy, on the Mac. CI doesn't run it.
meter:
	node tools/meter/render.mjs
setup:
	git config core.hooksPath .githooks
frontend:
	npm ci
	npm run typecheck
	npm test
	npm run build
# The paths, commands and tags the docs name exist. Needs only node.
facts:
	node scripts/check-facts.mjs
backend:
	@echo "Nothing to check: the site is static files served by nginx, with no server code."
integration: frontend
	node tests/integration.mjs
# Browsers and system packages are installed only in CI. The Mac has Playwright's browsers installed.
browser:
	npm ci
ifdef CI
	npx playwright install --with-deps chromium
endif
	npx playwright test $(PW_ARGS)
# The browser recipe without the timing and heavy-rendering tests. release.yml runs the full suite before staging.
browser-light:
	$(MAKE) browser PW_ARGS='--grep-invert "@timing|@render" $(PW_ARGS)'
# Builds public/resume.pdf from resume/resume.tex with tectonic. Run on the Mac; the first run downloads a TeX bundle, so it needs the network. CI does not run it.
resume:
	cd resume && tectonic resume.tex --outdir .
	cp -f resume/resume.pdf public/resume.pdf
	rm -f resume/resume.pdf
# Takes public/og-image.png, the link preview image, with a local browser that has WebGL. Run on purpose, through heavy, on the Mac. CI does not run it.
og-image:
	node tools/og-image.mjs
# Makes public/favicon.png and public/apple-touch-icon.png from the meter's committed images. Run on purpose, through heavy, on the Mac. Run it again after make meter. CI does not run it.
favicon:
	node tools/favicon.mjs
