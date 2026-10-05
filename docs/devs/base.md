# `src/base`: the packages Oasis ships with

Oasis does not fetch its libraries at install time. Everything the node needs to run lives in the repository, under `src/base/`, and a clone works as it is: no registry, no dependency resolution, no third party between you and a working node.

## What is where

| Path | What it holds |
| --- | --- |
| `src/base/node_modules/` | The runtime core: the SSB stack (ssb-db2, EBT, friends, blobs, conn…), koa, hyperaxe, crypto, image handling. |
| `src/server/node_modules` | A symbolic link to `../base/node_modules`. The folder has to be called `node_modules` for Node to resolve the packages' own dependencies next to them. `oasis.sh` and `install.sh` create it when it is missing, so every `require('../server/node_modules/…')` in the code keeps working untouched. |
| `src/server/package.json`, `package-lock.json` | The declaration of the core, pinned to the exact versions that are in `src/base`. Only used when the core is regenerated. |
| `src/AI/package.json`, `package-lock.json` | The AI stack: embeddings (`@xenova/transformers`, onnxruntime) as dependencies and the assistant (`node-llama-cpp`) as optional. Mostly large native binaries, so it is **not** in the repository. |
| `src/AI/node_modules/` | Where the AI stack is installed, only when AI features are chosen in `install.sh` (`npm ci` for the full assistant, `npm ci --omit=optional` for smart navigation only). Ignored by git. |

Native modules in the core (`sodium-native`, `leveldown`, `sharp`) ship prebuilt binaries. sodium-native and leveldown cover Linux x64 and arm64, macOS, Windows and Android. sharp's binaries are platform packages (`@img/sharp-linux-x64`, …): `src/base` carries Linux x64 and arm64, glibc and musl, so desktops, servers, Alpine containers and Raspberry-class boards all resize images; on any other platform Oasis degrades gracefully without sharp (images are served unresized). To add a platform, drop its `@img` packages into `src/base/node_modules/@img` and their entries into the lockfile (see below).

## Local adjustments

Local adjustments to vendored packages are applied by `scripts/patch-node-modules.js`.

## Regenerating the core

Do this only to upgrade or add a package, never as a routine:

```shell
cd src/server
rm node_modules                     # the link
npm ci                              # or: npm install <package>@<version>
cd ../..
rm -rf src/base/node_modules src/AI/node_modules
node scripts/build-base.js --dry    # check the split
node scripts/build-base.js --link   # writes src/base, src/AI/node_modules, both lockfiles, restores the link
node scripts/patch-node-modules.js
./oasis.sh test                     # the whole suite must pass
```

`build-base.js` walks the lockfile from the root dependencies: everything reachable from the non-AI roots goes to `src/base/node_modules`, everything reachable from the AI roots goes to `src/AI/node_modules` (packages needed by both are copied to both, because each tree must resolve on its own), and what is left (dev tools such as nodemon, nyc, typescript) stays behind in `src/server/node_modules.full`, which can be deleted. The optional canvas renderer of `pdfjs-dist` is skipped on purpose: Oasis only serves pdf.js to the browser.

For a platform other than the one you build on, install its binary packages explicitly before running `build-base.js`, for example `npm install --os=linux --cpu=arm64 sharp` and `npm install --os=linux --cpu=arm64 --libc=musl sharp` for Alpine.

Then commit `src/base/node_modules`, `src/server/package.json`, `src/server/package-lock.json`, `src/AI/package.json` and `src/AI/package-lock.json` together, and say in the commit what changed and why.

## Removing a dependency

Delete it from `src/server/package.json` and run:

```shell
node scripts/build-base.js --prune --dry   # lists what would leave src/base
node scripts/build-base.js --prune         # removes it and rewrites the lockfile
./oasis.sh test
```

`--prune` recomputes what is reachable from the declared dependencies inside the existing `src/base/node_modules`, so a package only disappears when nothing else needs it. Only dependencies that the code references are declared; everything else arrives transitively.

## Adding binaries for another platform

Platform packages (sharp's `@img/*`) are plain tarballs: `npm pack @img/sharp-linux-arm64@<version>` in a scratch directory, extract into `src/base/node_modules/@img/<name>` and add a lockfile entry copied from the equivalent x64 one (`version`, `resolved`, `integrity` from `npm pack --json`, `cpu`, `os`, `libc`, `optional: true`). The versions sharp expects are listed in `src/base/node_modules/sharp/package.json` under `optionalDependencies`.

## Development tools

`nodemon` is not part of `src/base`: `npm run dev` runs it through `npx`, which fetches it the first time. Do not `npm install` inside `src/server`, as that writes through the link into `src/base`.
