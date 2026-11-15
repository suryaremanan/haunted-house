# Mansion app-data persistence probe

This focused spike verifies the storage assumption that gates the Mansion Lifecycle implementation.

The standalone Haunted House backend does not receive Crew's in-gateway `AppContext`, so it cannot call `get_app_data_dir()`. Crew starts a standalone backend with the installed app root as its working directory. The backend seam in `backend_service.py` therefore accepts only an existing real `<app-root>/data` child beside a real `app.json`. It has no home-directory fallback and rejects missing, file-shaped, or linked `data` entries.

## What the probe proves

`probe.py`:

1. Locates Crew's own Python interpreter without printing its path.
2. Creates two versions of a synthetic gateway-managed app in an ephemeral folder under this spike.
3. Sets an isolated `KIROCREW_HOME`, so the real installed apps, mansion root, project files, configuration, and credentials are untouched.
4. Calls Crew's real `install_app` seam. Crew creates the installed app's `data/` directory.
5. Starts one standalone backend process to write a schema-versioned registry containing only a root-relative mansion path.
6. Starts a fresh backend process and verifies the registry is equivalent.
7. Calls Crew's real `update_app` seam, verifies the app code changed, then starts another fresh backend process and verifies the same registry and app-data directory survived.
8. Emits only a fixed JSON report. Absolute paths, subprocess errors, registry content, and app secrets never reach stdout.

If the Crew package or update seam is unavailable, the location differs from `<app-root>/data`, a restart loses the registry, or an update replaces it, the command exits nonzero with `"decision": "return_to_design"`.

## Run

```bash
python3 spikes/mansion-data-persistence/probe.py
```

Expected verified shape on Crew 0.12.2:

```json
{
  "backendRestartPreserved": true,
  "crewVersion": "0.12.2",
  "decision": "implementation_may_proceed",
  "isolatedDataHome": true,
  "registryEquivalent": true,
  "registrySchemaVersion": 1,
  "status": "verified",
  "updateLifecycle": "exercised",
  "updatePreserved": true,
  "verifiedPersistentLocation": "<app-root>/data"
}
```

Run the focused unit tests with:

```bash
.venv/bin/python -m pytest spikes/mansion-data-persistence/tests -q
```

## Crew 0.12.2 behavior checked

The packaged `kiro_crew.apps.manager_records.app_data_dir` resolves the app-owned location as `<app-root>/data`. The packaged gateway-managed `install_app` creates it. `update_app` moves a real `data/` directory aside before replacing the application tree and restores it before the update completes. The probe executes those installed 0.12.2 functions against an isolated Crew data home rather than duplicating their behavior.
