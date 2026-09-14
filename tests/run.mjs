#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const casesDir = path.join(root, "tests", "cases");
const renovate = path.join(root, "node_modules", ".bin", "renovate");

function metadataXml(groupId, artifactId, versions) {
  const latest = versions.at(-1);
  return `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <versioning>
    <latest>${latest}</latest>
    <release>${latest}</release>
    <versions>
      ${versions.map((v) => `<version>${v}</version>`).join("\n      ")}
    </versions>
  </versioning>
</metadata>
`;
}

function appPom(deps) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <dependencies>
${deps
  .map(
    (d) => `    <dependency>
      <groupId>${d.groupId}</groupId>
      <artifactId>${d.artifactId}</artifactId>
      <version>${d.current}</version>
    </dependency>`,
  )
  .join("\n")}
  </dependencies>
</project>
`;
}

function writeMavenRepo(dir, deps) {
  for (const d of deps) {
    const pkg = path.join(dir, d.groupId, d.artifactId);
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "maven-metadata.xml"), metadataXml(d.groupId, d.artifactId, d.available));
    for (const version of d.available) {
      const vdir = path.join(pkg, version);
      fs.mkdirSync(vdir);
      fs.writeFileSync(
        path.join(vdir, `${d.artifactId}-${version}.pom`),
        `<project><groupId>${d.groupId}</groupId><artifactId>${d.artifactId}</artifactId><version>${version}</version></project>\n`,
      );
    }
  }
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    const file = path.join(dir, req.url.slice(1));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      fs.createReadStream(file).pipe(res);
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function extractedDeps(logText) {
  const line = logText.split("\n").find((l) => l.includes("packageFiles with updates"));
  const files = Object.values(JSON.parse(line).config);
  return files.flatMap((group) => group.flatMap((file) => file.deps));
}

function runRenovate(cwd, logFile) {
  return new Promise((resolve, reject) => {
    spawn(renovate, ["--platform=local", "--onboarding=false"], {
      cwd,
      env: {
        ...process.env,
        LOG_LEVEL: "debug",
        RENOVATE_LOG_FILE: logFile,
        RENOVATE_TOKEN: "local",
      },
      stdio: "ignore",
    })
      .on("error", reject)
      .on("close", resolve);
  });
}

async function runCase(testCase) {
  const preset = JSON.parse(fs.readFileSync(path.join(root, `${testCase.preset}.json`), "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `renovate-config-${testCase.name}-`));
  const mavenDir = path.join(tmp, "maven");
  const repoDir = path.join(tmp, "repo");
  const logFile = path.join(tmp, "renovate.ndjson");
  const dependencies = testCase.dependencies.map((d, i) => ({
    ...d,
    groupId: `group${i}`,
    artifactId: `artifact${i}`,
  }));
  fs.mkdirSync(mavenDir);
  fs.mkdirSync(repoDir);
  writeMavenRepo(mavenDir, dependencies);

  const server = await serve(mavenDir);
  try {
    const config = {
      ...preset,
      fetchChangeLogs: "off",
      dependencyDashboard: false,
      enabledManagers: ["custom.regex"],
      customManagers: preset.customManagers.map((m) => ({
        ...m,
        registryUrlTemplate: `http://127.0.0.1:${server.address().port}`,
      })),
    };
    fs.writeFileSync(path.join(repoDir, "pom.xml"), appPom(dependencies));
    fs.writeFileSync(path.join(repoDir, "renovate.json"), JSON.stringify(config, null, 2));

    await runRenovate(repoDir, logFile);

    const deps = extractedDeps(fs.readFileSync(logFile, "utf8"));
    let failed = false;
    for (const expected of dependencies) {
      const name = `${expected.groupId}:${expected.artifactId}`;
      const dep = deps.find((d) => d.depName === name);
      const actual = dep?.updates?.[0]?.newValue ?? null;
      if (actual !== expected.expect) {
        console.log(`${testCase.name}: ${expected.description} ... FAIL`);
        console.error(`  expected ${expected.expect}, got ${actual}`);
        failed = true;
      } else {
        console.log(`${testCase.name}: ${expected.description} ... OK`);
      }
    }
    return failed;
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let failed = 0;
for (const file of fs.readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort()) {
  const testCase = JSON.parse(fs.readFileSync(path.join(casesDir, file), "utf8"));
  if (await runCase(testCase)) {
    failed += 1;
  }
}
if (failed) {
  process.exit(1);
}
