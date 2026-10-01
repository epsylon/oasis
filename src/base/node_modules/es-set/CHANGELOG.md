# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.1.2](https://github.com/es-shims/Set/compare/v1.1.1...v1.1.2) - 2024-09-18

### Commits

- [Refactor] update `es-abstract` usage to 2024 [`40d271f`](https://github.com/es-shims/Set/commit/40d271f1f34d0b4d6c62bce45f715f7aec032076)
- [Fix] `polyfill`: node 0.12 and io.js v1 and v2 have bugs with -0 [`ed296af`](https://github.com/es-shims/Set/commit/ed296afda1033a6100368148998fb21f791e38b6)
- [Deps] update `call-bind`, `define-properties`, `es-abstract`, `es-map`, `es-set-tostringtag`, `get-intrinsic`, `globalthis`, `has-property-descriptors`, `internal-slot`, `object.entries` [`dc732db`](https://github.com/es-shims/Set/commit/dc732dbcb9210174d423a9fc3f0756a04179c619)
- [Dev Deps] update `@es-shims/api`, `@ljharb/eslint-config`, `array.from`, `auto-changelog`, `npmignore`, `tape` [`8fc1319`](https://github.com/es-shims/Set/commit/8fc131935cbe65d273d903ccf16f421bf28ee7f5)
- [meta] add missing `engines.node` [`665656c`](https://github.com/es-shims/Set/commit/665656cd2d459fd09fe7d528b567a55994aa2667)
- [Tests] replace `aud` with `npm audit` [`7473c3c`](https://github.com/es-shims/Set/commit/7473c3c5e4a8b5f3aa16001055fbe834ef910233)
- [Dev Deps] temporarily pin @es-shims/api [`d41aeb6`](https://github.com/es-shims/Set/commit/d41aeb6bfc32216aeca3d9af717b0c3781a20a55)
- [Dev Deps] add missing peer dep [`c55907f`](https://github.com/es-shims/Set/commit/c55907f29ce6e8143d87decd766d23b88a621f55)

## [v1.1.1](https://github.com/es-shims/Set/compare/v1.1.0...v1.1.1) - 2023-08-28

### Commits

- [Deps] update `define-properties`,  `es-abstract`, `es-map`, `get-intrinsic`, `internal-slot`, `object.entries` [`0d4cd51`](https://github.com/es-shims/Set/commit/0d4cd51eb51eb65a7788f4500c8b56512035929b)
- [Dev Deps] update `@es-shims/api`, `@ljharb/eslint-config`, `array.from`, `aud`, `tape` [`f454b52`](https://github.com/es-shims/Set/commit/f454b52fdd88eb4e6b44f9e6d374fe44309ad744)

## [v1.1.0](https://github.com/es-shims/Set/compare/v1.0.3...v1.1.0) - 2023-01-14

### Commits

- [New] add `tools` export, for a trivial add/set/delete/has/forEach/size wrapper [`c22ba07`](https://github.com/es-shims/Set/commit/c22ba074110077a0a2767869f3be301a650aeab4)

## [v1.0.3](https://github.com/es-shims/Set/compare/v1.0.2...v1.0.3) - 2023-01-13

### Commits

- [Refactor] use `stop-iteration-iterator` [`ed7528c`](https://github.com/es-shims/Set/commit/ed7528cc769ab313c1a1f27ff715135947e85a39)
- [Deps] update `es-get-iterator` [`d0e7d4c`](https://github.com/es-shims/Set/commit/d0e7d4cdb777b6451d038f74c162489dd343ecf5)
- [Deps] update `es-set-to-stringtag` [`666ccde`](https://github.com/es-shims/Set/commit/666ccde4117ccafef2f848af54f6cd1133694066)

## [v1.0.2](https://github.com/es-shims/Set/compare/v1.0.1...v1.0.2) - 2023-01-12

### Commits

- [Fix] prevent identity discontinuity by improving polyfill/shim logic [`ce360a0`](https://github.com/es-shims/Set/commit/ce360a0a4300b522c1e12f499f2075ad45507f75)
- [Fix] handle older versions of Firefox [`0f02556`](https://github.com/es-shims/Set/commit/0f02556c916a4224f31397602d33781f14af1116)
- [Tests] use `for-each` for arrays [`c60ce24`](https://github.com/es-shims/Set/commit/c60ce24158e1b3b861fc357e327fd358bbe29419)
- [Deps] update `es-abstract`, `es-map`, `es-set-tostringtag` [`54a8bf1`](https://github.com/es-shims/Set/commit/54a8bf17a6ef7cc7a5d2fb74b59f51ae3453c71b)
- [Dev Deps] update `@ljharb/eslint-config` [`6349496`](https://github.com/es-shims/Set/commit/6349496e2f01dcb908e4a2410d5fcb0c9050babb)

## [v1.0.1](https://github.com/es-shims/Set/compare/v1.0.0...v1.0.1) - 2022-12-21

### Commits

- [Refactor] use `es-set-totringtag` [`6f5204b`](https://github.com/es-shims/Set/commit/6f5204bb0245edd40c8cb76470dcea437c2253a7)
- [Deps] update `es-abstract`, `internal-slot` [`4f68104`](https://github.com/es-shims/Set/commit/4f68104cbfbbcc832d721553b1920503078685a7)
- [Dev Deps] update `aud` [`9a56484`](https://github.com/es-shims/Set/commit/9a56484e6fbffe3841ba69f0bd6e692fdd086b1b)

## v1.0.0 - 2022-12-02

### Commits

- Write tests [`384ce9e`](https://github.com/es-shims/Set/commit/384ce9ede2188380aadfb2158ae03e26a52779b7)
- Implementation [`1f6328c`](https://github.com/es-shims/Set/commit/1f6328c8c2dec4eb912f40a8e4f2afe0e85006c5)
- Initial commit [`0476c40`](https://github.com/es-shims/Set/commit/0476c4032a20949badb8f3b6803ff9af64e1e95f)
- [actions] reuse common workflows [`136bfc8`](https://github.com/es-shims/Set/commit/136bfc8957983effecc19e53a2b594e4fec8ddda)
- [meta] fix package.json indentation [`8afa587`](https://github.com/es-shims/Set/commit/8afa5872a9b30ab3279d304964240df8012da6d3)
- [Refactor] use `internal-slot` for internal slots [`e2e6b86`](https://github.com/es-shims/Set/commit/e2e6b86ed4dba40661ca2614eb8a74f51f0f47f0)
- [Deps] update `call-bind`, `es-abstract`, `es-get-iterator`, `get-intrinsic`, `globalthis`, `has-symbols`, `internal-slot`, `object.entries` [`ebbb022`](https://github.com/es-shims/Set/commit/ebbb022543db0f7dd8d64158b1d6b887bcf5f9b9)
- [actions] update workflows [`acb55bd`](https://github.com/es-shims/Set/commit/acb55bd3a0c57849f0497bc85bfcf75d45552fdc)
- [Refactor] remove ESM entry points [`588c36e`](https://github.com/es-shims/Set/commit/588c36ebff7ae3f73926bde671b8519d99362280)
- [Deps] update `define-properties`, `es-abstract`, `functions-have-names`, `get-intrinsic`, `globalthis`, `has-symbols`, `object.entries` [`0a82d8b`](https://github.com/es-shims/Set/commit/0a82d8b672bf66d19d4e99a73f2efa2ac9c8b7c4)
- [meta] fix URLs [`27d2075`](https://github.com/es-shims/Set/commit/27d2075c1c9a1cf0bb157ad13fe075aa2d20ee37)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `array.from`, `safe-publish-latest`, `tape` [`e9cf4b0`](https://github.com/es-shims/Set/commit/e9cf4b010b77f8d04c6608f0b7ae139e97f3da18)
- [Tests] add `implementation` tests [`5868b55`](https://github.com/es-shims/Set/commit/5868b55f1c7827be6674310f43b5eb95751463f7)
- [Tests] run `nyc` on all tests [`7390e29`](https://github.com/es-shims/Set/commit/7390e296e6ddae251dd37e814395fa2c473f582f)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `array.from`, `aud`, `auto-changelog`, `tape` [`bffd518`](https://github.com/es-shims/Set/commit/bffd5183ab5726dd48a36a8de079a467765fafb2)
- [actions] update codecov uploader [`9c4e436`](https://github.com/es-shims/Set/commit/9c4e436ef787d59a69899ecdf09ea3cdf10a2dd7)
- [Deps] update `call-bind`; add `functions-have-names`, `get-intrinsic` and use where applicable [`5890f55`](https://github.com/es-shims/Set/commit/5890f5535b53235118d870365ae8c49b1785bd42)
- [readme] remove travis badge, fix URLs [`70e90b8`](https://github.com/es-shims/Set/commit/70e90b8b154b13816ea89063155c297f99709af5)
- Fix iojs 2.5 [`d2e6838`](https://github.com/es-shims/Set/commit/d2e6838b246ca00fbb836fb51a1a435594488f40)
- [actions] update rebase action to use reusable workflow [`d173489`](https://github.com/es-shims/Set/commit/d173489e6cab54aec3389bffbabd41d722d3542d)
- [Fix] `shim`: ensure `Map.call(new Map())` throws [`e6550fe`](https://github.com/es-shims/Set/commit/e6550fe07d0be8bb69be3cf5972587a28fb96207)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `aud`, `auto-changelog`, `tape` [`cd17a1c`](https://github.com/es-shims/Set/commit/cd17a1c1c8d9b797b762a1d81e6340e68e9658dd)
- [meta] use `npmignore` to autogenerate an npmignore file [`f2f6e39`](https://github.com/es-shims/Set/commit/f2f6e3942cc2caef81e7260887f3a2fab3426970)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `aud`, `has-strict-mode` [`98eea4b`](https://github.com/es-shims/Set/commit/98eea4b1e7d68b1a46a21239eef0ef3457c229ef)
- [readme] add github actions/codecov badges [`8de67c8`](https://github.com/es-shims/Set/commit/8de67c82c0ce20e0bef24d79fa056fcb25042b93)
- [Tests] increase coverage [`313a6d6`](https://github.com/es-shims/Set/commit/313a6d607ca29aa9a49a17fa64a4990f8cc81a87)
- [Refactor] use `for-each` instead of `foreach` [`f60071f`](https://github.com/es-shims/Set/commit/f60071fe178e5850b6c3135949cdd0c175cdc056)
- [Dev Deps] update `eslint`, `tape` [`3baccd0`](https://github.com/es-shims/Set/commit/3baccd0e25717983cf509caa4931ed5dbedbc793)
- [Deps] use actual `es-map` [`98e2fb6`](https://github.com/es-shims/Set/commit/98e2fb696e42e509d929779a9a6f1b21608e6936)
- [Tests] fix tests in symbol-less node [`122e2cb`](https://github.com/es-shims/Set/commit/122e2cbf3e97d13f60384c42646ded03a9544f5b)
- [Tests] add `@es-shims/api` [`56d12c2`](https://github.com/es-shims/Set/commit/56d12c2dcc2201435635a67a9ff59b23e75157dd)
- [Dev Deps] update `tape` [`cb861dd`](https://github.com/es-shims/Set/commit/cb861dd9076f9571e19dbaaea9b4bb1d850ec08d)
