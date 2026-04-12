FROM golang:1.23-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -trimpath -ldflags "-s -w" -o /vitesse ./cmd/vitesse

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -r -m vitesse
USER vitesse
COPY --from=builder /vitesse /usr/local/bin/vitesse
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD ["wget", "-qO/dev/null", "http://localhost:8080/health"]
ENTRYPOINT ["vitesse"]
