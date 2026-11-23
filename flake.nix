{
  description = "vitesse — boat speed tracker: Go API (paris+marne) + Next.js frontend";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAll = nixpkgs.lib.genAttrs systems;
      pkgsFor = s: nixpkgs.legacyPackages.${s};

      # Next.js frontend (standalone output). basePath and every NEXT_PUBLIC_*
      # value are baked at build time, so paris and marne are two builds.
      # The Nix source excludes the gitignored .env.local, so each deployment's
      # site settings MUST be declared here (they used to live only in
      # .env.local, which made the Nix-built Marne site render Paris defaults).
      siteEnv = {
        paris = {
          API_URL = "http://127.0.0.1:8092";
          NEXT_PUBLIC_BASE_PATH = "";
          NEXT_PUBLIC_MAP_ZONES = builtins.toJSON [
            { name = "Boulogne"; bounds = [ [ 48.8385 2.2565 ] [ 48.8585 2.2875 ] ]; }
            { name = "Trocadero"; bounds = [ [ 48.855 2.2875 ] [ 48.867 2.3035 ] ]; }
            { name = "Centre"; bounds = [ [ 48.854 2.3035 ] [ 48.865 2.347 ] ]; }
            { name = "Bastille"; bounds = [ [ 48.846 2.347 ] [ 48.858 2.369 ] ]; }
            { name = "Bercy"; bounds = [ [ 48.832 2.369 ] [ 48.848 2.3965 ] ]; }
          ];
          # Date the site went public (YYYY-MM-DD) — drawn as a marker on the
          # trend charts. Empty = no marker.
          NEXT_PUBLIC_LAUNCH_DATE = "";
        };
        marne = {
          API_URL = "http://127.0.0.1:8094";
          NEXT_PUBLIC_SITE_URL = "https://vitessebateauparis.com/marne";
          NEXT_PUBLIC_BASE_PATH = "/marne";
          NEXT_PUBLIC_SITE_NAME = "Vitesse Bateau Marne";
          NEXT_PUBLIC_CITY_NAME = "Val-de-Marne";
          NEXT_PUBLIC_RIVER_NAME = "Marne";
          NEXT_PUBLIC_RIVER_WITH_ARTICLE = "de la Marne";
          NEXT_PUBLIC_SPEED_LIMIT_KMH = "15";
          NEXT_PUBLIC_MAP_CENTER = "48.80,2.45";
          NEXT_PUBLIC_MAP_ZOOM = "12";
          NEXT_PUBLIC_MAP_ZONES = builtins.toJSON [
            { name = "Charenton"; bounds = [ [ 48.815 2.405 ] [ 48.830 2.440 ] ]; }
            { name = "Joinville"; bounds = [ [ 48.815 2.440 ] [ 48.830 2.480 ] ]; }
            { name = "Saint-Maur"; bounds = [ [ 48.795 2.470 ] [ 48.825 2.510 ] ]; }
            { name = "Bonneuil"; bounds = [ [ 48.770 2.445 ] [ 48.795 2.490 ] ]; }
          ];
          NEXT_PUBLIC_LAUNCH_DATE = "";
        };
      };

      mkFrontend = pkgs: site:
        let env = siteEnv.${site}; in
        pkgs.buildNpmPackage {
          pname = "vitesse-frontend${if site == "paris" then "" else "-${site}"}";
          version = "0.1.1";
          src = ./frontend;
          npmDepsHash = "sha256-N4aFSUezuSqyvCbDDACRcXqmWlyoprmVGlJrfJ8to38=";
          nativeBuildInputs = [ pkgs.makeWrapper ];
          env = env // { NEXT_TELEMETRY_DISABLED = "1"; };
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
          frontend = mkFrontend pkgs "paris";
          marne-frontend = mkFrontend pkgs "marne";
        });
      overlays.default = final: prev: {
        vitesse = self.packages.${final.system}.default;
        vitesse-frontend = self.packages.${final.system}.frontend;
        vitesse-marne-frontend = self.packages.${final.system}.marne-frontend;
      };
    };
}
