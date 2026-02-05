import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const strict = process.argv.includes("--strict");

// Common installation paths for CMake on Windows
const CMAKE_WINDOWS_PATHS = [
  "C:\\Program Files\\CMake\\bin\\cmake.exe",
  "C:\\Program Files (x86)\\CMake\\bin\\cmake.exe",
];

function hasCommand(command) {
  const checker = process.platform === "win32" ? "where" : "command";
  const checkerArgs = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, checkerArgs, { stdio: "ignore" });
  if (result.status === 0) return true;

  // On Windows, also check common installation paths
  if (process.platform === "win32" && command === "cmake") {
    for (const cmakePath of CMAKE_WINDOWS_PATHS) {
      if (existsSync(cmakePath)) {
        return true;
      }
    }
  }
  return false;
}

const missing = [];
if (!hasCommand("cmake")) missing.push("cmake");

if (missing.length === 0) {
  console.log("Doctor: OK");
  process.exit(0);
}

console.log(`Doctor: missing dependencies: ${missing.join(" ")}`);

switch (process.platform) {
  case "darwin":
    console.log("Install: brew install cmake");
    break;
  case "linux":
    console.log("Ubuntu/Debian: sudo apt-get install cmake");
    console.log("Fedora: sudo dnf install cmake");
    console.log("Arch: sudo pacman -S cmake");
    break;
  case "win32":
    console.log("Install: choco install cmake");
    console.log("Or download from: https://cmake.org/download/");
    break;
  default:
    console.log("Install CMake from: https://cmake.org/download/");
    break;
}

process.exit(strict ? 1 : 0);

