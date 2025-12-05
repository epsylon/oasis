# Changelog

All notable changes to this project will be documented in this file.

<!--
## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->

## v0.6.2 - 2025-12-05

### Added

 + Added a footer (Core plugin).
 + Added favorites to media related modules (Favorites plugin).
 + Added advanced search engine integration into modules (Search plugin).
 
### Changed

 * Added Oasis version at GUI (Core plugin).
 + Added templates for reporting standardization (Reports plugin).
 + Added market new functionalities (Market plugin).
 + Added bookmarks new functionalities (Bookmarks plugin).
 + Added jobs new filters (Jobs plugin).
 
### Fixed

 + Security fixes (Core plugin).
 + Reports filters (Reports plugin).
 + Tasks minor changes (Tasks plugin).
 + Events minor changes (Events plugin).
 + Votations minor changes (Votations plugin).
 + Market minor changes (Market plugin).
 + Projects minor changes (Projects plugin).
 + Jobs minor changes (Jobs plugin).
 + Transfers minor changes (Transfers plugin).

## v0.6.1 - 2025-12-01

### Changed

 + Added more notifications for tribes activity (Activity plugin).
 + Reordered filters (Opinions plugin).
 
### Fixed

 + Feed minor changes (Feed plugin).
 + Tribes feed styles container (Tribes plugin).

## v0.6.0 - 2025-11-29

### Changed

 + Added more opinion categories (Opinions plugin).
 
### Fixed

 + Tag counters (Tags plugin).
 + Duplicated content when searching (Search plugin).
 + Inhabitant-linked styles for Contact and PUB (Activity plugin).
 + Old posts retrieving at inhabitant profile (Core plugin).
 + Fixed threading comments (Core plugin).

## v0.5.9 - 2025-11-28

### Added

 + Added fixed (also linked) threads into activity feed (Activity plugin).
 
### Fixed

 + Fixed laws stats (Parliament plugin).

## v0.5.8 - 2025-11-25

### Fixed

 + Fixed post preview from a pre-cached context (Core plugin).
 + Fixed tasks assignement to others different to the author (Core plugin).
 + Fixed comments context adding different to blog/post (Core plugin).

## v0.5.7 - 2025-11-24

### Added

 + Collapsible menu entries (Core plugin).

### Fixed

 + Remote videos fail to load at Firefox/LibreWolf (Core plugin).
 + Fixed the comment query to return all posts whose root is the topic ID (Core plugin).
 + Fixed render-format for latest posts (Core plugin).
 + Fixed inhabitants listing for short-time activities (Activity plugin).

## v0.5.6 - 2025-11-21

### Added

 + Extended post-commenting into various modules (bookmarks, images, audios, videos, documents, votations, events, tasks, reports, market, projects, jobs).
 
### Changed

 + Added details about current proposals at Courts (Courts plugin).
 + Parliament proposal listing when voting process has started (Parliament plugin).
 
### Fixed

 + Votations deduplication applied when directly voting from Parliament (Votes plugin).
 
## v0.5.5 - 2025-11-15

### Added

 + Conflicts resolution system (Courts plugin).
 
## v0.5.4 - 2025-10-30

### Fixed

 + Content stats (Stats plugin).
 + Non-avatar inhabitants listing (Inhabitants plugin).
 + Inhabitants suggestions (Inhabitants plugin).
 + Activity level (Inhabitants plugin).
 + Parliament duplication (Parliament plugin).
 + Added Parliament to blockexplorer (Blockexplorer plugin).

## v0.5.3 - 2025-10-27

### Fixed

 + Tribes duplication (Tribes plugin + Activity plugin + Stats plugin).

## v0.5.2 - 2025-10-22

### Added

 + Government system (Parliament plugin).
 
### Fixed

 + Forum category translations (Forum plugin).

## v0.5.1 - 2025-09-26

### Added

 + Activity level measurement (Inhabitants plugin).
 + Home page settings (Settings plugin).

### Fixed

 + ECOIn wallet addresses (Banking plugin).
 + Tribes view (Tribes plugin).
 + Inhabitants view (Inhabitants plugin).
 + Avatar view (Main module).
 + Forum posts (Forums plugin).
 + Tribes info display (Search plugin).

## v0.5.0 - 2025-09-20

### Added

 + Custom answer training (AI plugin).

### Fixed

 + Clean-SNH theme.
 + AI learning (AI plugin).

## v0.4.9 - 2025-09-01

### Added

 + French translation.
 
### Changed

- Inbox (PM plugin).

## v0.4.8 - 2025-08-27
 
### Fixed

 + Fixed legacy codes (invites plugin).
 + Fixed SHS generator (script).
 
### Changed

- SHS CAPS (for private gardering).
- Deploy PUB documentation.
- Invites.
- Banking.
- Inhabitants.

## v0.4.7 - 2025-08-27

### Added

 + Online, discovered, unknown listing (peers plugin).
 + Federated, unfederated, unreachable networks (invites plugin).
 
### Fixed

 + Fixed mentioning (mentions plugin).
 + Forum feed (activity plugin).
 
### Changed

- Stats.
- Mentions.
- Peers.
- Invites.
- Activity.

## v0.4.6 - 2025-08-24
 
### Fixed

 + Follow/Unfollow and Pledges (projects plugin).
 + Karma SCORE (inhabitants plugin).
 
### Changed

- Activity.
- Inhabitants.
- Search.

## v0.4.5 - 2025-08-21

### Added

 + Exchange (ECOin current value) for all inhabitants (banking plugin).
 + Karma SCORE.
 + Upload a set of images/collections (images plugin).
 
### Fixed

 + Add a new bounty (projects plugin).
 + Activity duplications.
 
### Changed

- Activity.
- Avatar.
- Inhabitants.
- Stats.

## v0.4.4 - 2025-08-17

### Added

 + Projects: Module to explore, crowd-funding and manage projects.
 + Banking: Module to distribute a fair Universal Basic Income (UBI) using commons-treasury.
 
### Changed

- AI.
- Activity.
- BlockExplorer.
- Statistics.
- Avatar.

## v0.4.3 - 2025-08-08

### Added

- Limiter to blockchain logstream retrieval.

  + Jobs: Module to discover and manage jobs.
  + BlockExplorer: Module to navigate the blockchain.

## v0.4.0 - 2025-07-29

### Added

  + Forums: Module to discover and manage forums.

## v0.3.8 - 2025-07-21

### Added

- AI model called "42".

## v0.3.5 - 2025-06-21 (summer solstic)

### Changed

- Hardcore "hacking" and refactoring for: models + backend + middleware + views.

### Added

- Some "core" modules:

  + Agenda: Module to manage all your assigned items.
  + Audios: Module to discover and manage audios.
  + Bookmarks: Module to discover and manage bookmarks.
  + Cipher: Module to encrypt and decrypt your text symmetrically (using a shared password).
  + Documents: Module to discover and manage documents.
  + Events: Module to discover and manage events.
  + Feed: Module to discover and share short-texts (feeds).
  + Governance: Module to discover and manage votes.
  + Images: Module to discover and manage images.
  + Invites: Module to manage and apply invite codes.
  + Legacy: Module to manage your secret (private key) quickly and securely.
  + Latest: Module to receive the most recent posts and discussions.
  + Market: Module to exchange goods or services.
  + Multiverse: Module to receive content from other federated peers.
  + Opinions: Module to discover and vote on opinions.
  + Pixelia: Module to draw on a collaborative grid.
  + Popular: Module to receive posts that are trending, most viewed, or most commented on.
  + Reports: Module to manage and track reports related to issues, bugs, abuses, and content warnings.
  + Summaries: Module to receive summaries of long discussions or posts.
  + Tags: Module to discover and explore taxonomy patterns (tags).
  + Tasks: Module to discover and manage tasks.
  + Threads: Module to receive conversations grouped by topic or question.
  + Transfers: Module to discover and manage smart-contracts (transfers).
  + Trending: Module to explore the most popular content.
  + Tribes: Module to explore or create tribes (groups).
  + Videos: Module to discover and manage videos.
  + Wallet: Module to manage your digital assets (ECOin).
  + Topics: Module to receive discussion categories based on shared interests.

- New languages: Spanish, Euskara and French.

- New themes: SNH-Clear, SNH-Purple and SNH-Matrix.

- L.A.R.P (Live Action Role-PLaying) structure.

## v0.3.0 - 2024-12-15

### Changed

- Migration to Node.js v22.12.0 (LTS)

## v0.2.3 - 2022-11-05

### Added

- Federation with SSB Multiverse

## v0.1.0 - 2022-07-24

### Added

- Initial commit
