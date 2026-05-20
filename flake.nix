{
  description = "vitesse — boat rental service API (shared by vitesse-bateau-paris and -marne)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAll = nixpkgs.lib.genAttrs systems;
      pkgsFor = s: nixpkgs.legacyPackages.${s};
    in {
      packages = forAll (s: {
        default = (pkgsFor s).buildGoModule {
          pname = "vitesse";
          version = "0.1.0";
          src = ./.;
          vendorHash = "sha256-zkrkIPndfs/o1tqRDweK8OIU/HeqXf7ltcn46vJmOb8=";
          subPackages = [ "cmd/vitesse" ];
        };
      });
      overlays.default = final: prev: {
        vitesse = self.packages.${final.system}.default;
      };
    };
}
