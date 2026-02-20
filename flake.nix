{
  description = "bookmarker development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [ node ];

          shellHook = ''
            export PATH="${node}/bin:$PATH"

            node_major="$(node -p 'process.versions.node.split(".")[0]')"
            npm_major="$(npm -v | cut -d. -f1)"

            if [ "$node_major" != "22" ]; then
              echo "Expected Node 22, got $(node -v)" >&2
              return 1
            fi

            if [ "$npm_major" != "10" ]; then
              echo "Expected npm 10, got $(npm -v)" >&2
              return 1
            fi

            echo "bookmarker dev shell ready: node $(node -v), npm $(npm -v)"
          '';
        };
      }
    );
}
