# Maintaining

Please read the [contract](./contract) that defines the maintainer role in this
project. In short:

- Please merge any patches that reduce the number of problems in this project.
- If you have small nitpicks about a patch, please merge the patch and write a
  new patch with your preferred improvements.
- **Take care of yourself and don't burn out.** Please don't sacrifice your
  health to improve this project, and know that there are much more important
  things in life than merging pull requests quickly.

## Tips

### Checking out a patch

If you want to check out pull request number 42 and you're comfortable running
the code on your local device.

```sh
remote="https://code.03c8.net/krakenlabs/oasis.git"
git fetch "$remote"
git reset --hard $remote master
git pull "$remote" pull/42/head
(cd test && node run.js) && ./oasis.sh
```

No need to add their fork as a remote.

Or for ultimate convenience (and github lock-in), use the [github cli tool](https://cli.github.com):

```sh
gh pr list
gh pr checkout 42
```

## Packages

Oasis ships its runtime libraries inside the repository (`src/base`); `src/server/node_modules` is a link to it. Upgrading or adding a package is a deliberate step with its own procedure, described in [`base.md`](./base.md). Release artefacts (the `.deb`, tarballs) simply carry `src/base`, so they install without npm.
