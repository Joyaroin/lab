# CI runs these. Replace each with this project's real commands.
.PHONY: setup frontend backend integration browser
setup:
	git config core.hooksPath .githooks
frontend:
	@echo "No frontend checks yet"
backend:
	@echo "No backend checks yet"
integration:
	@echo "No integration tests yet"
browser:
	@echo "No browser tests yet"
