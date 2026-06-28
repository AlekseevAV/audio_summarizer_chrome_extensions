.PHONY: all install build watch test clean

# Default: produce a loadable extension in dist/
all: build

# Install dependencies
install:
	npm install

# Build the extension into dist/
build:
	npm run build

# Rebuild on changes (development)
watch:
	npm run watch

# Run the unit test suite
test:
	npm test

# Remove build output
clean:
	rm -rf dist
