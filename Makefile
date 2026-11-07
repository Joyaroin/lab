# CI runs these.
.PHONY: room setup frontend backend integration browser facts
room:
	blender -b -P tools/room/build.py -- --out src/assets/room.glb
	blender -b -P tools/room/resize.py -- src/assets/room.glb --size 2048
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
browser:
	npm ci
	npx playwright install --with-deps chromium
	npx playwright test $(PW_ARGS)
