## MODIFIED Requirements

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
