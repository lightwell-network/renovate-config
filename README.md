# Lightwell Renovate config

> [!WARNING]
> **Beta.** These presets are for testing only and are not yet officially supported.

Shareable [Renovate](https://docs.renovatebot.com/) presets for Lightwell packages. Applications import a named preset with `extends`; they do not copy the custom manager into every repo.

Pin a git tag so consuming repos do not float onto breaking preset changes.

## Presets

| Preset | Behavior |
|---|---|
| [`java-remediated`](java-remediated.json) | Only bumps the Lightwell rebuild (`3.7.1-rhlw.00001` → `3.7.1-rhlw.00002`). |
| [`java-upgrade`](java-upgrade.json) | Maven versioning, but keeps only `rhlw` artifacts. Upstream jumps are allowed (`3.7.1-rhlw.00001` → `3.18.0-rhlw.00001`). |
| [`java-manager`](java-manager.json) | Custom manager only. Use this when the app supplies its own `packageRules`. |

## Usage

Add the preset to the application's `renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "github>lightwell-network/renovate-config:java-remediated#v1.0.0"
  ],
  "hostRules": [
    {
      "matchHost": "packages.redhat.com",
      "hostType": "maven",
      "username": "<lightwell-service-account>",
      "password": "<lightwell-token>"
    }
  ]
}
```

A full example is in [`examples/java-renovate.json`](examples/java-renovate.json).

Credentials stay in the consuming application (or the Renovate bot config). This repository does not ship `hostRules` secrets.

## Override the registry

The presets look up Maven artifacts on `https://packages.redhat.com/lightwell/java/remediated`. To use an Artifactory virtual repo instead, override `registryUrls` and add `hostRules` for the Artifactory host. A full example is in [`examples/java-artifactory-renovate.json`](examples/java-artifactory-renovate.json).

```json
{
  "extends": ["github>lightwell-network/renovate-config:java-remediated#v1.0.0"],
  "hostRules": [
    {
      "matchHost": "artifactory.example.com",
      "hostType": "maven",
      "username": "<artifactory-username>",
      "password": "<artifactory-token>"
    }
  ],
  "packageRules": [
    {
      "matchManagers": ["custom.regex"],
      "matchDatasources": ["maven"],
      "registryUrls": ["https://artifactory.example.com/artifactory/lightwell-java-all"]
    }
  ]
}
```

## Versioning

Release git tags (`v1.0.0`, `v1.1.0`, `v2.0.0`) for this repository. Applications pin with `#v1.0.0`. Breaking changes to the regex, versioning, or disabled managers go to a new major tag.

## CI tests

Run `npm test`, which starts a local Maven repo from the version lists in [`tests/cases/`](tests/cases/) and runs Renovate with `--platform=local`. Each case states the versions that exist and the version the preset must propose.

```bash
npm install
npm test
```

Add a JSON file under `tests/cases/` to cover another catalog or preset. `expect` is the `newValue` Renovate should choose, or `null` for no update.
