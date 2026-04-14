import { describe, expect, it } from "vitest";
import { highlightLine, languageFromPath } from "./syntax";

describe("syntax", () => {
  it("resolves preview languages for java/spring/python/sql/toml/gitignore/lock/shell files", () => {
    expect(languageFromPath("src/main/java/App.java")).toBe("java");
    expect(languageFromPath("pom.xml")).toBe("markup");
    expect(languageFromPath("src/main/resources/application.properties")).toBe("properties");
    expect(languageFromPath("scripts/main.py")).toBe("python");
    expect(languageFromPath("src/main/resources/application-dev.yml")).toBe("yaml");
    expect(languageFromPath("queries/report.sql")).toBe("sql");
    expect(languageFromPath("configs/settings.toml")).toBe("toml");
    expect(languageFromPath(".gitignore")).toBe("git");
    expect(languageFromPath("Cargo.lock")).toBe("toml");
    expect(languageFromPath("yarn.lock")).toBe("yaml");
    expect(languageFromPath("scripts/dev-local.sh")).toBe("bash");
    expect(languageFromPath("scripts/release.zsh")).toBe("bash");
    expect(languageFromPath(".envrc")).toBe("bash");
  });

  it("keeps baseline preview language mappings", () => {
    expect(languageFromPath("src/main.ts")).toBe("typescript");
    expect(languageFromPath("src/main.js")).toBe("javascript");
    expect(languageFromPath("README.md")).toBe("markdown");
    expect(languageFromPath("styles/main.css")).toBe("css");
    expect(languageFromPath("config/settings.yaml")).toBe("yaml");
    expect(languageFromPath("data/sample.json")).toBe("json");
  });

  it("resolves preview languages for the frozen first-round additions", () => {
    expect(languageFromPath("src/App.vue")).toBe("markup");
    expect(languageFromPath("server/index.php")).toBe("php");
    expect(languageFromPath("scripts/task.rb")).toBe("ruby");
    expect(languageFromPath("src/Program.cs")).toBe("csharp");
    expect(languageFromPath("lib/main.dart")).toBe("dart");
    expect(languageFromPath("android/app/build.gradle")).toBe("groovy");
    expect(languageFromPath("build.gradle.kts")).toBe("kotlin");
    expect(languageFromPath("config/app.ini")).toBe("ini");
    expect(languageFromPath("config/supervisor.conf")).toBe("ini");
    expect(languageFromPath(".env.production")).toBe("ini");
    expect(languageFromPath("C:\\Repo\\docker-compose.override.yml")).toBe("yaml");
  });

  it("highlights new preview languages without dropping back to escaped plain text", () => {
    expect(highlightLine("class Program {}", "csharp")).toContain("token");
    expect(highlightLine("FROM php:8.3-cli", "php")).toContain("token");
    expect(highlightLine("answer = 42", "ruby")).toContain("token");
    expect(highlightLine("sdk: ^3.0.0", "dart")).toContain("token");
    expect(highlightLine("plugins { id(\"app\") }", "kotlin")).toContain("token");
    expect(highlightLine("APP_ENV=dev", "ini")).toContain("token");
  });

  it("falls back to escaped plain text when language is unknown", () => {
    const highlighted = highlightLine("<tag>", "unknown-language");
    expect(highlighted).toBe("&lt;tag&gt;");
  });
});
