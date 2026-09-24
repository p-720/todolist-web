{
  description = "Pomotasker - SvelteKit habit tracker";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    devshell.url = "github:numtide/devshell";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, devshell, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (system:
      let
        inherit (nixpkgs) lib;
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [ devshell.overlays.default ];
        };
        app = pkgs:
          pkgs.buildNpmPackage {
            pname = "pomotasker";
            version = "0.1.0";
            src = ./.;
            npmDepsHash = "sha256-Uj4hXvX9E7lqVs9BO3JSFPFR57JSWQHmWX5GE7UrzNw=";
            nodejs = pkgs.nodejs_22;
            nativeBuildInputs = [ pkgs.python3 pkgs.node-gyp pkgs.pkg-config ];
            buildInputs = [ pkgs.sqlite ];
            dontNpmBuild = false;
            npmBuildScript = "build";
            npmFlags = [ "--build-from-source" ];
            installPhase = ''
              mkdir -p $out/lib/node_modules/pomotasker-web
              cp -r package.json build node_modules $out/lib/node_modules/pomotasker-web/
              cp server.js ws-server.js reminders.js auth-server.js $out/lib/node_modules/pomotasker-web/
            '';
          };
      in rec {
        packages = { default = app pkgs; };

        apps = {
          default = {
            type = "app";
            program = "${pkgs.writeShellScript "pomotasker" ''
              exec ${pkgs.nodejs_22}/bin/node ${
                (app pkgs)
              }/lib/node_modules/pomotasker-web/server.js
            ''}";
          };
        };

        devShell = pkgs.devshell.mkShell {
          name = "pomotasker";
          packages = [ pkgs.nodejs_22 ];
        };
      }
    ) // {
      nixosModules.pomotasker = { config, lib, pkgs, ... }:
        let
          pkg = self.packages.${pkgs.system}.default;
          base = "${pkg}/lib/node_modules/pomotasker-web";
        in {
          options.pomotasker = {
            enable = lib.mkEnableOption "Pomotasker";
            port = lib.mkOption {
              type = lib.types.int;
              default = 3000;
              description = "Port";
            };
            host = lib.mkOption {
              type = lib.types.str;
              default = "0.0.0.0";
              description = "Bind address (0.0.0.0 for all interfaces)";
            };
            dataDir = lib.mkOption {
              type = lib.types.path;
              default = "/var/lib/pomotasker";
              description = "Persistent data dir (DB lives here)";
            };
          };

          config = lib.mkIf config.pomotasker.enable {
            users.users.pomotasker = {
              isSystemUser = true;
              group = "pomotasker";
            };
            users.groups.pomotasker = { };

            systemd.services.pomotasker = {
              description = "Pomotasker";
              after = [ "network.target" ];
              serviceConfig = {
                Type = "simple";
                ExecStart = "${pkgs.nodejs_22}/bin/node ${base}/server.js";
                WorkingDirectory = config.pomotasker.dataDir;
                StateDirectory = "pomotasker";
                User = "pomotasker";
                Group = "pomotasker";
                Restart = "on-failure";
                RestartSec = 5;
                Environment = [
                  "PORT=${toString config.pomotasker.port}"
                  "HOST=${config.pomotasker.host}"
                  "BASE_PATH=/pomotask"
                  "NODE_PATH=${base}/node_modules"
                ];
              };
            };
          };
        };
    };
}
