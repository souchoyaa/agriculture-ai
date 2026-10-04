# Frontend decisions and TODO

Role-owned notes. Contract 0.1.0. See README.md in this folder for the journey and run commands.

## Decisions
- No navigation/state library: a tiny route stack + one React context keeps the bundle small for modest Android devices. Tabs bottom on phones, side rail ≥ 900 px.
- Dependencies added: `@react-native-async-storage/async-storage` (durable local save), `expo-image-picker` (camera/gallery, permission requested only on tap), dev `playwright-core` (screenshots/smoke using local Chrome).
- Map is a tile-free schematic plus a text list (works offline, accessible). No map SDK until the backend publishes features worth it.
- Attention ordering uses backend status + age only; no client risk model.
- Farmer self-report is the observation source while no on-device/remote vision is available (see README for the signal mapping).
- Computed-key object rest destructuring (`const { [id]: _, ...rest } = obj`) misbehaved in the web bundle (busy flag never cleared); use clone + delete.

## TODO / next
- Copy native photos into app document storage (expo-file-system) so they survive cache clearing.
- When backend publishes sourced guidance, environment or map features, verify rendering against real payloads (renderer covered by unit checks only).
- Proposed contract extension (not required): a persisted observation endpoint so "synced" can become real.
- Native device verification (Expo Go) of camera, storage and back-button behaviour.
