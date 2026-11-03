# Maintaining

Please read the [contract](./contract.md) that defines the maintainer role in this
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
the code on your local device, from a clone whose `origin` is
`https://code.03c8.net/KrakensLab/oasis.git`:

```sh
git fetch origin
git reset --hard origin/master
git pull origin pull/42/head
./oasis.sh test && ./oasis.sh
```

No need to add their fork as a remote.

Or for ultimate convenience (and github lock-in), use the [github cli tool](https://cli.github.com):

```sh
gh pr list
gh pr checkout 42
```

## Changelog

Every new feature and every major fix that ships goes into [`CHANGELOG.txt`](./CHANGELOG.txt) as one short line under the version being prepared, newest version first: a `YYYY-MM-DD · OASIS x.y.z` line, then one `- ` line per change. It is read by people running the published version, so each line says what they get, in a few words, without implementation details or the steps taken while the version was being prepared. Small adjustments to the look of a page are not listed. Oasis shows it in TOOLS → Changelog, the current version as a large card and the older ones below in rows of five. The first version listed must be the one in `src/server/package.json`.

## Packages

Oasis ships its runtime libraries inside the repository (`src/base`); `src/server/node_modules` is a link to it. Upgrading or adding a package is a deliberate step with its own procedure, described in [`base.md`](./base.md). Release artefacts (the `.deb`, tarballs) simply carry `src/base`, so they install without npm.
