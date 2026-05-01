# Changelog (archived)

This file contains older changes of ioBroker.poolcontrol.  
Recent changes can be found in the README.md.

---
## 1.3.4 (2026-04-19)

- Fixed critical i18n issue in solarInsightsHelper and solarLogbookHelper that could lead to instability or crashes
- Switched translation handling to I18n.translate() for stable and consistent i18n behavior

## 1.3.3 (2026-04-18)

- Added solar COP calculation to evaluate system efficiency
- Added solar logbook helper with easy-to-read daily summaries for better user understanding

## 1.3.2 (2026-04-17)

- Fix: Solar Extended no longer interferes with controlHelper or timeHelper (prevents unwanted pump shutdown)
- Fix: Solar Extended no longer interferes with standard solar mode
- Fix: Improved handling of external actuator (clean ON/OFF behavior depending on Solar Extended state)
- Improvement: Added stable delta hysteresis (delta_on / delta_off) to prevent switching fluctuations
- Improvement: Replaced global timers with adapter timers in solarExtendedHelper
- Cleanup: Removed duplicate reading of request_active state

## 1.3.1 (2026-04-17)

- Fix: Solar Extended now correctly controls the pump
- Fix: Integrated Solar Extended into existing solar status handling via `speech.solar_active`
- Improvement: Consistent pump status display for Solar and Solar Extended
- Minor bug fixes and internal optimizations

## 1.3.0 (2026-04-16)

- Added extended solar control (delta-based temperature logic)
- Support for external actuator control (boolean/socket)
- Standard / Extended solar mode selection
- Priority and blocking logic (controlHelper, timeHelper, pump mode, season)
- Improved status states (active, request, blocked, reason, info)
- Added i18n support for solar extended status texts
- Added selectable configuration for temperature source and control type

## 1.2.22 (2026-04-16)

- Added new read-only state `solar.request_active` to indicate when solar logic would request the pump
- Improved solarHelper robustness by handling invalid temperature values

## 1.2.21 (2026-04-15)

- Fixed photovoltaic afterrun timer restarting on every recalculation without PV surplus
- Afterrun now starts only once and runs reliably to completion
- Proper cleanup when surplus becomes active again during afterrun

## 1.2.20
Release: 11.04.2026
- (DasBo) Reduced unnecessary state writes in status and photovoltaic helpers. Summary and PV timestamps are now only updated when the functional result actually changes, making the adapter quieter without affecting existing logic.

## 1.2.19
Release: 10.04.2026
- Fixed an interaction issue between `photovoltaicHelper` and `controlHelper` where automatic follow-up pumping could be stopped unexpectedly
- photovoltaicHelper now respects controlHelper priority and no longer stops the pump while automatic follow-up pumping is active
- Fixed an issue where `controlHelper` could remain in "nachpumpen" state if the pump was stopped externally
- `photovoltaic.threshold_w` is now correctly synchronized with the instance configuration
- Changes to the PV surplus threshold in adapter settings are now reliably reflected in the corresponding read-only datapoint

## 1.2.18
Release: 07.04.2026
- Fixed persistence issue for `status.season_active` (no longer overwritten on adapter start)
- Improved persistence for frost protection settings

## 1.2.17
Release: 07.04.2026
- Fix: Resolved an issue where the pressure learning reset button did not trigger reliably. The pumpHelper4 now explicitly subscribes to its relevant internal states to ensure proper event handling.

## 1.2.15
Release: 22.03.2026
- Fix i18n usage (replace I18n.t with I18n.translate) to resolve adapter startup crash and restart loop on certain systems.


*(older versions are automatically moved to CHANGELOG_OLD.md)*

---

## 1.2.14 (2026-03-22)
- Added i18n support for chemistry help texts

---

## 1.2.13 (2026-03-22)
- Added multilingual state names and descriptions (DE/EN)
- Improved consistency of all state texts
- Minor text and structure refinements

---

## 1.2.12 (2026-03-21)
- Repository cleanup and fixes for ioBroker repository checker
- Restored required native object in io-package.json
- Removed invalid properties and outdated entries
- Updated README

---

## 1.2.11
- Repository cleanup (ioBroker checker issues resolved)
- Removed invalid properties from io-package.json
- README updated

---

## 1.2.10 (2026-03-20)
- Improved German translations in the admin UI (jsonConfig)
- Fixed incorrect and misleading terminology (e.g. flow vs. temperature sensors)
- Improved consistency and wording across all configuration options

---

## 1.2.9 (2026-03-19)
- Fixed invalid common object in runtime channel

---

## 1.2.7 (2026-03-16)
- Corrected role definitions for writable states according to ioBroker guidelines
- Set several internal learning and diagnostic states to read-only
- Removed obsolete files from repository

---

## 1.2.6 (2026-03-12)
- Fixed remaining adapter checker issues
- Updated release-script plugins
- Converted remaining log messages to English
- Updated dependabot configuration
- Reduced `common.news` entries in io-package.json

---

## 1.2.5 (2026-03-07)
- Fixed issue in `actuatorsHelper` with incorrect state handling
- Minor internal improvements

---

## 1.2.4 (2026-03-07)
- Fixed synchronization issue between instance configuration and internal states in actuatorsHelper

---

## 1.2.3 (2026-03-06)
- Replaced native timers with adapter timers
- Added cleanup of timers on adapter unload
- Internal code cleanup

---

## 1.2.2 (2026-03-06)
- Raised required admin version to >=7.6.20
- Updated translations after jsonConfig refactoring
- Maintenance update

---

## 1.2.1 (2026-03-06)
- Migrated admin configuration to i18n system
- Translations managed via admin/i18n
- Generated via `npm run translate`

---

## 1.2.0 (2026-02-15)
- Activated multilingual support (i18n) in jsonConfig
- Bilingual configuration (DE/EN)
- No functional changes

---

## 1.1.0 (2026-01-23)
- Introduced passive pump performance recommendation (`pump.speed`)
- Derived logical pump performance states (`off`, `frost`, `low`, `normal`, `high`, `boost`)
- Recommendation based on pump logic and helper states
- Added configurable percentage recommendation (0–100%)
- No active control, external system integration only

---

## 1.0.0 (2026-01-02)
- Added support for optional pool actuators
- Configurable via admin UI
- External object ID support
- Added runtime and control states
- Strict system separation

---

## 0.9.0 (2025-12-28)
- Introduced heating / heat pump control (`heatHelper`)
- Automatic heating request
- Configurable target/max temperature
- Ownership protection for pump control
- New state `heat.heating_request`

---

## 0.8.2 (2025-12-25)
- Added AI chemistry help module
- Informational system for water problems
- No dosing, no control, no speech
- New states under `ai.chemistry_help.*`

---

## 0.8.0 (2025-12-08)
- Added AI modules (weather, tips, summaries)
- Introduced `aiForecastHelper`
- Daily forecast + pool recommendations
- Improved AI structure

---

## 0.7.4 (2025-12-03)
- Fixed controlHelper bug

---

## 0.7.0 (2025-11-29)
- Introduced pressure sensor system
- Trend detection and learning values
- Informational only

---

## 0.6.2 (2025-11-07)
- Improved admin UI
- Extended speech system
- Cleanup

---

## 0.6.0 (2025-11-03)
- Introduced photovoltaic control
- Pump control based on PV surplus
- Improved logic and persistence

---

## 0.5.5 (2025-11-01)
- Fixed statistics loop issue

---

## 0.5.3 (2025-10-30)
- Added Telegram user selection

---

## 0.5.2 (2025-10-30)
- Improved helper priority system
- Fixed conflicts between time and solar control

---

## 0.5.0 (2025-10-28)
- Added weekly/monthly statistics
- Event-based helpers
- Persistent outputs

---

## 0.4.0 (2025-10-26)
- Introduced statistics system
- Min/max/average tracking
- JSON and HTML outputs
- Event-based processing

---

## 0.3.1 (2025-10-18)
- Stabilized frost protection logic

---

## 0.3.0 (2025-10-12)
- Introduced pump learning system
- Real flow calculation
- Event-based architecture

---

## 0.2.2 (2025-10-08)
- Added control section
- Improved speech and status system

---

## 0.2.1 (2025-09)
- Improved speech system
- Fixed duplicate messages

---

## 0.2.0 (2025-08)
- Introduced modular helper structure
- Added statusHelper
- Integrated speech system

---

## 0.1.0 (2025-07)
- First working version
- Basic pump control and temperature monitoring

---

## 0.0.1
- Initial project structure
- Adapter base created