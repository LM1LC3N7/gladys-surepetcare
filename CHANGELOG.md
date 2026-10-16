# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Sure Petcare account (e-mail and password of the app): the session is kept
  across restarts and renewed before it expires, its end date shows in the
  connection status, and a refused password is reported without retrying.
- One device per hub, SureFlap cat flap or pet door, SureFeed feeder and
  Felaqua: online state, battery, bowl weights and last meal (with the pet
  that ate it), water left and water level.
- One device per pet: inside or outside, dated with the time it went through
  the flap, minutes since that move, last meal and last drink.
- The lock mode of the flaps from Gladys: unlocked, keep in, keep out, locked
  or curfew (the curfew times of the flap, turned off by the other modes and
  back on with the same times).
- Scene triggers "Pet went out", "Pet came in" and "Pet ate", with the pet,
  the flap or feeder and the amount eaten.
- One read of the whole account per minute (30 s to 10 min), pauses after
  errors and when Sure Petcare asks to slow down, cloud badges marked
  unreachable when the hub reports a device offline.
- "Test the connection" button with a summary of the account.
- Feature and lock mode names in French or English.

[Unreleased]: https://github.com/LM1LC3N7/gladys-surepetcare/commits/main
