#!/bin/bash
# Create a DMG with drag-to-install panel for CodeMoss
#
# Usage:
#   ./scripts/create-dmg.sh <app_path> <output_dmg_path> [volume_name]

set -euo pipefail

APP_PATH="${1:?Usage: $0 <app_path> <output_dmg_path> [volume_name]}"
OUTPUT_DMG="${2:?Usage: $0 <app_path> <output_dmg_path> [volume_name]}"
VOLUME_NAME="${3:-CodeMoss-Install}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Finder DMG layout uses point-based coordinates; prefer 1x background.
BG_IMAGE="${ROOT_DIR}/src-tauri/icons/dmg-background.png"
BG_IMAGE_2X="${ROOT_DIR}/src-tauri/icons/dmg-background@2x.png"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: App not found at $APP_PATH"
  exit 1
fi

if [ ! -f "$BG_IMAGE" ]; then
  BG_IMAGE="$BG_IMAGE_2X"
fi
if [ ! -f "$BG_IMAGE" ]; then
  echo "Error: Background image not found"
  exit 1
fi

OUTPUT_DIR="$(dirname "$OUTPUT_DMG")"
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DMG"

echo "Creating DMG with drag-to-install panel..."
echo "  App: $APP_PATH"
echo "  Output: $OUTPUT_DMG"
echo "  Volume: $VOLUME_NAME"

TEMP_DMG=""
MOUNT_DIR=""
DISK_NAME=""
STAGE_DIR=""

copy_app_bundle() {
  local src="$1"
  local dst="$2"
  local dst_parent

  dst_parent="$(dirname "$dst")"

  for attempt in 1 2 3; do
    rm -rf "$dst"

    if command -v ditto >/dev/null 2>&1; then
      if ditto --noextattr --noqtn --noacl --nopersistRootless "$src" "$dst"; then
        return 0
      fi
      echo "Warning: ditto copy failed (attempt $attempt/3)"
    fi

    rm -rf "$dst"
    if cp -R -X "$src" "$dst"; then
      return 0
    fi
    echo "Warning: cp copy failed (attempt $attempt/3)"

    rm -rf "$dst"
    if tar -C "$(dirname "$src")" -cf - "$(basename "$src")" | tar -C "$dst_parent" -xf -; then
      local extracted_path="$dst_parent/$(basename "$src")"
      if [ "$extracted_path" != "$dst" ]; then
        rm -rf "$dst"
        mv "$extracted_path" "$dst"
      fi
      xattr -cr "$dst" 2>/dev/null || true
      return 0
    fi
    echo "Warning: tar stream copy failed (attempt $attempt/3)"

    sleep 1
  done

  return 1
}

create_applications_alias() {
  local target_dir="$1"
  local target_path="$target_dir/Applications"
  local alias_path=""

  rm -rf "$target_path"

  alias_path=$(
    osascript <<APPLESCRIPT
tell application "Finder"
  set aliasFile to make alias file to POSIX file "/Applications" at POSIX file "$target_dir"
  return POSIX path of (aliasFile as alias)
end tell
APPLESCRIPT
  ) || true

  alias_path=$(printf '%s' "$alias_path" | tr -d '\r')

  if [ -n "$alias_path" ] && [ -e "$alias_path" ]; then
    if [ "$alias_path" != "$target_path" ]; then
      mv "$alias_path" "$target_path"
    fi
    return 0
  fi

  echo "Warning: Failed to create Finder alias for Applications, falling back to symlink"
  ln -s /Applications "$target_path"
}

cleanup() {
  if [ -n "$MOUNT_DIR" ]; then
    hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || hdiutil detach "$MOUNT_DIR" -force -quiet 2>/dev/null || true
  fi

  if [ -n "$TEMP_DMG" ] && [ -f "$TEMP_DMG" ]; then
    rm -f "$TEMP_DMG" || true
  fi

  if [ -n "$STAGE_DIR" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf "$STAGE_DIR" || true
  fi

  return 0
}
trap cleanup EXIT

APP_SIZE_KB=$(du -sk "$APP_PATH" | cut -f1)
DMG_SIZE_KB=$((APP_SIZE_KB + 20480))

STAGE_DIR="$(mktemp -d /tmp/codemoss-dmg-stage-XXXXXX)"
mkdir -p "$STAGE_DIR/.background"

if ! copy_app_bundle "$APP_PATH" "$STAGE_DIR/CodeMoss.app"; then
  echo "Error: Failed to stage app bundle"
  exit 1
fi

create_applications_alias "$STAGE_DIR"
cp "$BG_IMAGE" "$STAGE_DIR/.background/background.png"

TEMP_DMG="$(mktemp /tmp/codemoss-dmg-XXXXXX).dmg"
rm -f "$TEMP_DMG"

echo "Creating writable DMG image..."
hdiutil create   -volname "$VOLUME_NAME"   -ov   -size "${DMG_SIZE_KB}k"   -fs HFS+   -format UDRW   -srcfolder "$STAGE_DIR"   "$TEMP_DMG"

echo "Mounting and configuring layout..."
MOUNT_OUTPUT=$(hdiutil attach -readwrite -noverify -nobrowse "$TEMP_DMG")
MOUNT_DIR=$(printf '%s\n' "$MOUNT_OUTPUT" | awk -F'	' '/\/Volumes\// { print $NF; exit }')

if [ -z "$MOUNT_DIR" ]; then
  echo "Error: Failed to mount DMG"
  exit 1
fi
if [ ! -w "$MOUNT_DIR" ]; then
  echo "Error: Mounted DMG is not writable: $MOUNT_DIR"
  mount | grep "on $MOUNT_DIR " || true
  ls -ldeO "$MOUNT_DIR" || true
  exit 1
fi

DISK_NAME="$(basename "$MOUNT_DIR")"

echo "Configuring Finder window layout via AppleScript..."
if ! osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$DISK_NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {100, 100, 760, 500}

    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 80
    set text size of theViewOptions to 12
    set background picture of theViewOptions to file ".background:background.png"

    set position of item "CodeMoss.app" of container window to {180, 170}
    set position of item "Applications" of container window to {480, 170}

    close
    open
    update without registering applications
    delay 2
  end tell
end tell
APPLESCRIPT
then
  echo "Warning: AppleScript layout configuration failed (expected in CI). DMG will still contain Applications alias."
fi

chmod -Rf go-w "$MOUNT_DIR" 2>/dev/null || true
sync

echo "Finalizing DMG..."
hdiutil detach "$MOUNT_DIR" -quiet || hdiutil detach "$MOUNT_DIR" -force -quiet
MOUNT_DIR=""

hdiutil convert "$TEMP_DMG" -format UDZO -o "$OUTPUT_DMG"

rm -f "$TEMP_DMG"
TEMP_DMG=""

rm -rf "$STAGE_DIR"
STAGE_DIR=""

echo ""
echo "DMG created successfully: $OUTPUT_DMG"
echo "Size: $(du -h "$OUTPUT_DMG" | cut -f1)"
