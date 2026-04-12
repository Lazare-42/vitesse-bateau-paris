BINARY    := vitesse
MODULE    := github.com/lazrossi/vitesse-bateau-paris
VERSION   := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT    := $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS   := -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildDate=$(BUILD_DATE)

.PHONY: build build-release run test fmt lint tidy clean docker-up docker-down

build:
	go build -ldflags "$(LDFLAGS)" -o $(BINARY) ./cmd/vitesse

build-release:
	go build -trimpath -ldflags "-s -w $(LDFLAGS)" -o $(BINARY) ./cmd/vitesse

run: build
	./$(BINARY)

test:
	go test ./...

fmt:
	go fmt ./...

lint:
	golangci-lint run

tidy:
	go mod tidy

clean:
	rm -f $(BINARY)

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-build:
	docker compose build
