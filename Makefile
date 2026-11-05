# CI runs these.
.PHONY: setup frontend backend integration browser
setup:
	git config core.hooksPath .githooks
frontend:
	npm ci
	npm run typecheck
	npm test
	npm run build
backend:
	@echo "Nothing to check: the site is static files served by nginx, with no server code."
integration: frontend
	node tests/integration.mjs
browser:
	npm ci
	npx playwright install --with-deps chromium
	npx playwright test
