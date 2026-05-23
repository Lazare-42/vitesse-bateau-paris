{
  description = "vitesse — boat speed tracker: Go API (paris+marne) + Next.js frontend";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAll = nixpkgs.lib.genAttrs systems;
      pkgsFor = s: nixpkgs.legacyPackages.${s};

      # Next.js frontend (standalone output). basePath is baked at build time
      # (NEXT_PUBLIC_BASE_PATH), so paris ("") and marne ("/marne") are two builds.
      mkFrontend = pkgs: basePath:
        pkgs.buildNpmPackage {
          pname = "vitesse-frontend${if basePath == "" then "" else "-marne"}";
          version = "0.1.1";
          src = ./frontend;
          npmDepsHash = "sha256-N4aFSUezuSqyvCbDDACRcXqmWlyoprmVGlJrfJ8to38=";
          nativeBuildInputs = [ pkgs.makeWrapper ];
          env = {
            NEXT_TELEMETRY_DISABLED = "1";
            NEXT_PUBLIC_BASE_PATH = basePath;
          };
          # buildPhase runs `npm run build` (= next build) by default.
          installPhase = ''
            runHook preInstall
            dir=$out/share/vitesse-frontend
            mkdir -p "$dir"
            cp -r .next/standalone/. "$dir"/
            mkdir -p "$dir/.next"
            cp -r .next/static "$dir/.next/static"
            [ -d public ] && cp -r public "$dir/public" || true
            makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/vitesse-frontend \
              --add-flags "$dir/server.js"
            runHook postInstall
          '';
        };
    in {
      packages = forAll (s:
        let pkgs = pkgsFor s; in {
          default = pkgs.buildGoModule {
            pname = "vitesse";
            version = "0.1.1";
            src = ./.;
            vendorHash = "sha256-zkrkIPndfs/o1tqRDweK8OIU/HeqXf7ltcn46vJmOb8=";
            subPackages = [ "cmd/vitesse" ];
          };
          frontend = mkFrontend pkgs "";
          marne-frontend = mkFrontend pkgs "/marne";
        });
      overlays.default = final: prev: {
        vitesse = self.packages.${final.system}.default;
        vitesse-frontend = self.packages.${final.system}.frontend;
        vitesse-marne-frontend = self.packages.${final.system}.marne-frontend;
      };
    };
}
