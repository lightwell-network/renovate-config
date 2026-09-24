# Lightwell Renovate config

> [!WARNING]
> **Beta.** These presets are for testing only and are not yet officially supported.

Shareable [Renovate](https://docs.renovatebot.com/) presets for Lightwell packages. Applications import a named preset with `extends`; they do not copy the custom manager into every repo.

Pin a git tag so consuming repos do not float onto breaking preset changes.

## Presets

| Preset | Behavior |
|---|---|
| [`java-remediated`](java-remediated.json) | Only bumps the Lightwell rebuild (`3.7.1.rhlw-00001` → `3.7.1.rhlw-00002`). |
| [`java-upgrade`](java-upgrade.json) | Maven versioning, but keeps only `rhlw` artifacts. Upstream jumps are allowed (`3.7.1.rhlw-00001` → `3.18.0.rhlw-00001`). |
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

## Pin transitives

`scripts/pin-transitives.mjs` runs Maven, then Renovate in the current repo, using whatever `renovate.json` is already there. It lists rhlw updates (Direct and Transitive) and does not edit `pom.xml`. `--mvn` and `--renovate` each replace the whole command with one string.

Pass `--write` to write a BOM for `dependencyManagement`. The default file is `lightwell-pins.xml` next to `pom.xml`; `--write` may take another path. A new file uses `com.lightwell:rhlw-pins:0.0.1`. If the file already exists, `--write` rewrites the `dependencyManagement` section, bumps the project version, and leaves the rest of the file unchanged.

Maven must write a JSON dependency tree. Defaults:

```bash
mvn -B -Dstyle.color=never dependency:tree -DoutputType=json -DoutputFile=dependency-tree.json
renovate --platform=local --onboarding=false --dry-run=lookup
```

If you pass `--mvn`, include the same JSON flags (`-DoutputType=json -DoutputFile=...`). The Maven tree, a pom listing every resolved dependency for Renovate, and the Renovate log are stored in a temp directory that is printed at the end and is not deleted. Renovate is run against that scan pom; it cannot see Maven transitives from the app `pom.xml` alone.

The app must have `renovate.json` and `renovate` installed (or available in a parent `node_modules`).

```bash
cd /path/to/app
node /path/to/renovate-config/scripts/pin-transitives.mjs
node /path/to/renovate-config/scripts/pin-transitives.mjs --mvn "mvn -s settings.xml dependency:tree -DoutputType=json -DoutputFile=dependency-tree.json"
node /path/to/renovate-config/scripts/pin-transitives.mjs --renovate "npx renovate --platform=local --onboarding=false --dry-run=lookup"
node /path/to/renovate-config/scripts/pin-transitives.mjs --write
node /path/to/renovate-config/scripts/pin-transitives.mjs --write path/to/lightwell-pins.xml
```

Install the BOM so Maven can resolve it, then import it from the app `pom.xml`. Overrides can sit above the import in `dependencyManagement` (first entry wins). When `--write` bumps the pin file version, update the import `<version>` to match.

```bash
mvn install:install-file -Dfile=lightwell-pins.xml -DpomFile=lightwell-pins.xml
```

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.lightwell</groupId>
      <artifactId>rhlw-pins</artifactId>
      <version>0.0.1</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
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
