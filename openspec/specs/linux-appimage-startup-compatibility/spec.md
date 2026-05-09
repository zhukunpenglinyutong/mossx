# linux-appimage-startup-compatibility Specification

## Purpose

定义 Linux AppImage 在 Wayland 环境下的启动兼容守卫，确保 WebKitGTK/Wry webview 创建前能应用有边界、可解释、可回退的 fallback，同时不影响 macOS 与 Windows 启动链路。

## Requirements

### Requirement: Linux AppImage Wayland startup MUST apply a bounded first-stage WebKitGTK fallback before webview creation

When the application starts in a Linux runtime context that is both `Wayland`-backed and `AppImage`-backed, the host MUST evaluate startup compatibility before constructing the main webview and MUST apply a repository-owned first-stage fallback only when the user has not already supplied an explicit override.

#### Scenario: first-stage dmabuf fallback is applied for official high-risk startup context

- **WHEN** the application starts on Linux
- **AND** `XDG_SESSION_TYPE=wayland` or `WAYLAND_DISPLAY` is present
- **AND** `APPIMAGE` or `APPDIR` is present
- **AND** `WEBKIT_DISABLE_DMABUF_RENDERER` is not already set by the user
- **THEN** the host MUST set `WEBKIT_DISABLE_DMABUF_RENDERER=1` before creating the main webview

#### Scenario: non-risk startup context does not receive repository-owned dmabuf fallback by default

- **WHEN** the application starts on Linux
- **AND** the startup context is not both `Wayland`-backed and `AppImage`-backed
- **THEN** the host MUST NOT inject the repository-owned first-stage dmabuf fallback by default

### Requirement: Linux startup fallback MUST preserve explicit user environment overrides and remain platform-isolated

Repository-owned startup compatibility defaults MUST behave as additive Linux-only guards rather than broad environment overrides, including WebKitGTK input-method environment repair.

#### Scenario: user-supplied WebKit fallback env wins over repository defaults

- **WHEN** the application starts on Linux
- **AND** the user has already set `WEBKIT_DISABLE_DMABUF_RENDERER` or `WEBKIT_DISABLE_COMPOSITING_MODE`
- **THEN** the host MUST preserve the user-supplied value
- **AND** the repository MUST NOT overwrite that variable with a new default

#### Scenario: user-supplied IME module env wins over repository defaults

- **WHEN** the application starts on Linux
- **AND** the user has already set `GTK_IM_MODULE` or `QT_IM_MODULE`
- **THEN** the host MUST preserve the user-supplied value
- **AND** the repository MUST NOT overwrite that variable with a new input-method default

#### Scenario: macOS and Windows startup paths remain untouched by Linux fallback policy

- **WHEN** the application starts on macOS or Windows
- **THEN** the Linux startup compatibility guard MUST NOT inject Linux-specific `WEBKIT_*` or IME module env
- **AND** the Linux guard state MUST NOT alter existing macOS or Windows startup recovery behavior

### Requirement: Linux startup guard MUST repair missing WebKitGTK IME module env when an inherited input-method signal exists

The Linux startup compatibility guard MUST set bounded input-method defaults before creating the WebView when the process inherited enough evidence to identify the active IME family but did not inherit GTK/Qt module variables.

#### Scenario: fcitx signal repairs missing GTK and Qt IME module env

- **WHEN** the application starts on Linux
- **AND** `XMODIFIERS` or `CLUTTER_IM_MODULE` indicates `fcitx`
- **AND** `GTK_IM_MODULE` is not already set
- **AND** `QT_IM_MODULE` is not already set
- **THEN** the host MUST set `GTK_IM_MODULE=fcitx` before creating the main webview
- **AND** the host MUST set `QT_IM_MODULE=fcitx` before creating the main webview

#### Scenario: ibus signal repairs missing GTK and Qt IME module env

- **WHEN** the application starts on Linux
- **AND** `XMODIFIERS`, `CLUTTER_IM_MODULE`, `GTK_IM_MODULE`, or `QT_IM_MODULE` indicates `ibus`
- **AND** one of the GTK/Qt module variables is missing
- **THEN** the host SHOULD set the missing module variable to `ibus` before creating the main webview

#### Scenario: no recognized IME signal does not inject module env

- **WHEN** the application starts on Linux
- **AND** no inherited input-method environment signal identifies `fcitx` or `ibus`
- **THEN** the host MUST NOT inject repository-owned `GTK_IM_MODULE` or `QT_IM_MODULE` defaults

### Requirement: Repeated unready Linux launches MUST escalate conservatively and reset on renderer-ready success

The system MUST treat a Linux startup that fails before renderer-ready as an unready launch and MAY apply a stronger second-stage fallback on the next eligible launch, but only within the Linux high-risk compatibility context.

#### Scenario: consecutive unready launch enables second-stage compositing fallback

- **WHEN** the previous eligible Linux startup was left in `launch_in_progress` state because renderer-ready was never marked
- **AND** the next startup occurs in the same Linux `Wayland + AppImage` high-risk context
- **AND** `WEBKIT_DISABLE_COMPOSITING_MODE` is not already set by the user
- **THEN** the host MUST apply the configured second-stage compositing fallback before creating the main webview

#### Scenario: renderer-ready success clears unready escalation state

- **WHEN** a Linux startup reaches the existing renderer-ready signal
- **THEN** the compatibility guard MUST clear `launch_in_progress`
- **AND** the guard MUST reset the consecutive unready launch counter used for fallback escalation

### Requirement: Linux startup diagnostics MUST record compatibility inputs and chosen fallback evidence

The host MUST emit enough structured startup diagnostics to explain why a Linux compatibility fallback did or did not activate.

#### Scenario: diagnostics show high-risk context inputs and repository fallback decision

- **WHEN** the Linux startup compatibility guard evaluates a launch
- **THEN** diagnostics MUST record whether `XDG_SESSION_TYPE`, `WAYLAND_DISPLAY`, `DISPLAY`, `APPIMAGE`, and `APPDIR` indicated a high-risk startup context
- **AND** diagnostics MUST record which repository-owned fallback stages were applied

#### Scenario: diagnostics distinguish user override from repository default

- **WHEN** the Linux startup compatibility guard encounters an explicit user-supplied `WEBKIT_*` fallback variable
- **THEN** diagnostics MUST record that the effective value came from user override
- **AND** diagnostics MUST distinguish that from repository-owned default injection
