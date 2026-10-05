# Oasis Installation Guide

This guide will walk you through the process of installing **Oasis** on your device. 

You can either use the automated installation script or manually download the source code.

---

## 1) Automated Installation (Recommended)

To install **Oasis** with a single command, run: 

    ./install.sh

Both `install.sh` and `oasis.sh` are plain POSIX `sh` scripts and executable, so `./oasis.sh`, `sh oasis.sh` and `bash oasis.sh` all work.

The script detects your package manager (apt, pacman, dnf, zypper, apk, xbps or brew), installs `git`, `curl` and `tar`, installs Node.js 22 only if your system does not already have a recent enough one, links the packages Oasis ships in `src/base` and, if you want AI features, installs the AI stack and downloads the models.

Oasis carries its own libraries in the repository (`src/base`), so a clone runs without asking npm or any registry for anything; `install.sh` only creates the `src/server/node_modules` link to it and checks that it loads. The AI stack (`node-llama-cpp`, embeddings) is the exception: a large set of mostly native binaries, installed in `src/AI/node_modules` only when you choose AI, from the exact versions pinned in `src/AI/package-lock.json`. See [`docs/devs/base.md`](../devs/base.md).

If you prefer to manage Node.js yourself (nvm, a distro package, a container), skip the system packages:

    OASIS_NO_SYSTEM_DEPS=1 ./install.sh

To run it unattended, choose the AI option beforehand with `OASIS_AI=full`, `OASIS_AI=nav` or `OASIS_AI=none`.

The AI models are fetched from a list of mirrors, tried in order until one answers with a sound package (the SolarNET.HuB server and the PUBs that host a copy). Put your own first with `OASIS_MODEL_MIRRORS=https://your.mirror/path`; the packages are `oasis-42-1-chat.Q4_K_M.gguf.tar.gz` and `oasis-embeddings.tar.gz`. If no mirror answers, the installer finishes without AI and you can run it again later.

---

## 2) Manual Installation 

You need `git`, `curl`, `tar` and **Node.js 22 or newer**. Some ways to get Node.js:

    # Debian / Ubuntu
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
    sudo apt-get install -y nodejs
    # Arch / Manjaro
    sudo pacman -S --needed nodejs npm
    # Fedora
    sudo dnf install nodejs npm
    # openSUSE
    sudo zypper install nodejs22 npm22
    # Alpine
    sudo apk add nodejs npm
    # Any distro, macOS
    nvm install 22

Then:

    git clone https://code.03c8.net/KrakensLab/oasis
    cd oasis
    ln -s ../base/node_modules src/server/node_modules
    
---

## 3) Upgrading from an older Oasis

The first start of this version converts your local log from the old `flume` format to `ssb-db2` (`~/.ssb/db2/`), in the background and once. Make a copy of `~/.ssb` before upgrading, as with any upgrade. After it, **do not start an older Oasis on the same `~/.ssb`**: it cannot read the new format and would see your identity with no messages. A guard file is left behind so that such a version refuses to start rather than publish from zero and fork your feed; keep it.

## 4) Run Oasis

To run **Oasis** just launch: 

    ./oasis.sh
