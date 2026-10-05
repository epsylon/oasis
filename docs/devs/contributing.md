# Contributing

If you want to dive into the details, please see the [contract](./contract.md)
that defines the contributor role in this project. If you're comfortable with
a top-level summary, you can start here first.

Our workflow is basically [GitHub Flow][github-flow] with specific roles:

- **Contributor:** Write patches that reduce the number of problems.
- **Maintainers:** Merge patches that reduce the number of problems.

If you have an issue, it's best to open an issue to describe the problem and
discuss solutions, but don't worry if you've already skipped that step.

Assuming you already have a [developer install](./install.md) you should be
able to start editing source code. There are a few useful commands you should
know about:

- **`./install.sh`**: Ensure that everything is in place (the packages ship in `src/base`; the installer only links them and, if you want AI, installs its stack).
- **`./oasis.sh test`**: Ensure that all automated tests pass. It runs them in a test directory of its own and never touches your `~/.ssb`; from `test/`, `ssb_path=<an empty scratch dir> node run.js mods/<module>` runs one module's suite.

Please run the test suite before writing a commit, because if there are errors then
maintainers won't be able to merge your patch. Please ask for help if the tests
are giving you any trouble.

[github-flow]: https://guides.github.com/introduction/flow/
