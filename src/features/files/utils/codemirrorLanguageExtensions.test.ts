import { describe, expect, it } from "vitest";
import {
  codeMirrorExtensionsForEditorLanguage,
  codeMirrorExtensionsForPath,
} from "./codemirrorLanguageExtensions";

describe("codeMirrorExtensionsForPath", () => {
  it("returns editor extensions for java/spring/python/sql/toml/gitignore/lock/shell-group paths", () => {
    expect(codeMirrorExtensionsForPath("src/main/java/App.java").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("src/main/resources/pom.xml").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("src/main/resources/application.properties").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("scripts/main.py").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("src/main/resources/application.yml").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("queries/report.sql").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("configs/settings.toml").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath(".gitignore").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("Cargo.lock").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("yarn.lock").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("scripts/dev-local.sh").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("scripts/release.zsh").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath(".envrc").length).toBeGreaterThan(0);
  });

  it("keeps baseline editor language coverage", () => {
    expect(codeMirrorExtensionsForPath("src/main.ts").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("src/main.js").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("src/view.json").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("README.md").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("styles/main.css").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("config/settings.yaml").length).toBeGreaterThan(0);
  });

  it("falls back to plain text for unsupported types", () => {
    expect(codeMirrorExtensionsForPath("assets/logo.bmp")).toEqual([]);
    expect(codeMirrorExtensionsForPath("README")).toEqual([]);
  });

  it("keeps first-round config and language capability boundaries explicit", () => {
    expect(codeMirrorExtensionsForPath("docker-compose.yml").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("README.env").length).toBe(0);
    expect(codeMirrorExtensionsForPath(".env.production").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("src/App.vue")).toEqual([]);
    expect(codeMirrorExtensionsForPath("server/index.php")).toEqual([]);
    expect(codeMirrorExtensionsForPath("scripts/task.rb")).toEqual([]);
    expect(codeMirrorExtensionsForPath("src/Program.cs")).toEqual([]);
    expect(codeMirrorExtensionsForPath("lib/main.dart")).toEqual([]);
    expect(codeMirrorExtensionsForPath("android/app/build.gradle").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("build.gradle.kts").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("config/app.ini").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForPath("config/supervisor.conf").length).toBeGreaterThan(0);
  });

  it("supports direct editor-language lookup for shared render-profile orchestration", () => {
    expect(codeMirrorExtensionsForEditorLanguage("yaml").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForEditorLanguage("shell").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForEditorLanguage("properties").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForEditorLanguage("groovy").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForEditorLanguage("kotlin").length).toBeGreaterThan(0);
    expect(codeMirrorExtensionsForEditorLanguage(null)).toEqual([]);
  });
});
