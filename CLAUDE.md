# CodeMoss

## 项目概览

Tauri 2 桌面应用，前端 React 19 + TypeScript + Vite，后端 Rust。

## 技术栈

- **前端**: React 19, TypeScript 5, Vite 7, Vitest
- **后端**: Rust (Tauri 2.9), git2, whisper-rs, portable-pty, reqwest
- **构建**: npm + Cargo, Tauri CLI
- **测试**: Vitest (前端), cargo test (后端)

## 常用命令

```bash
npm run tauri:dev          # 开发模式
npm run tauri:build        # 构建 (仅当前架构)
npm run build              # 仅前端构建
npm run test               # 运行前端测试
npm run lint               # ESLint 检查
npm run typecheck          # TypeScript 类型检查
```

## macOS 本地打包发布流程

### 前提条件

- Apple Developer Program 已注册
- Developer ID Application 证书已导入钥匙串
- App Store Connect API 密钥已创建 (.p8 文件)
- 公证凭据已保存: `xcrun notarytool store-credentials "CodeMoss-Notarize" --key <.p8路径> --key-id <KeyID> --issuer <IssuerID>`

### 签名身份

```
Developer ID Application: kunpeng zhu (RLHBM56QRH)
```

### 打包 Apple Silicon 版本 (aarch64)

```bash
# 1. 安装依赖
npm ci

# 2. 构建应用
npm run tauri -- build --bundles app

# 3. 捆绑 OpenSSL 并签名
CODESIGN_IDENTITY="Developer ID Application: kunpeng zhu (RLHBM56QRH)" \
  scripts/macos-fix-openssl.sh src-tauri/target/release/bundle/macos/CodeMoss.app

# 4. 生成 DMG
mkdir -p release-local/dmg-root
ditto src-tauri/target/release/bundle/macos/CodeMoss.app release-local/dmg-root/CodeMoss.app
hdiutil create -volname "CodeMoss" -srcfolder release-local/dmg-root -ov -format UDZO \
  release-local/CodeMoss_<版本号>_aarch64.dmg

# 5. 公证
xcrun notarytool submit release-local/CodeMoss_<版本号>_aarch64.dmg \
  --keychain-profile "CodeMoss-Notarize" --wait

# 6. 装订票据
xcrun stapler staple release-local/CodeMoss_<版本号>_aarch64.dmg
```

### 打包通用版本 (Universal: Intel + Apple Silicon)

```bash
# 0. 安装 x86_64 编译目标 (仅首次)
rustup target add x86_64-apple-darwin

# 0. 准备 x86_64 OpenSSL (仅首次)
brew fetch --force --bottle-tag=sequoia openssl@3
BOTTLE=$(find ~/Library/Caches/Homebrew/downloads -name "*openssl*3*sequoia*" -type f | head -1)
mkdir -p /tmp/openssl-x86_64
tar xf "$BOTTLE" -C /tmp/openssl-x86_64 --strip-components=2

# 1. 构建通用应用
X86_64_APPLE_DARWIN_OPENSSL_DIR=/tmp/openssl-x86_64 \
  npm run tauri -- build --target universal-apple-darwin --bundles app

# 2. 合并 daemon 二进制 (Tauri 不自动处理额外 binary)
lipo -create \
  src-tauri/target/aarch64-apple-darwin/release/code_moss_daemon \
  src-tauri/target/x86_64-apple-darwin/release/code_moss_daemon \
  -output src-tauri/target/universal-apple-darwin/release/code_moss_daemon

# 3. 重新运行 bundle
X86_64_APPLE_DARWIN_OPENSSL_DIR=/tmp/openssl-x86_64 \
  npm run tauri -- build --target universal-apple-darwin --bundles app

# 4. 创建通用 OpenSSL 动态库
APP_PATH="src-tauri/target/universal-apple-darwin/release/bundle/macos/CodeMoss.app"
mkdir -p "$APP_PATH/Contents/Frameworks"
lipo -create /opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib /tmp/openssl-x86_64/lib/libcrypto.3.dylib \
  -output "$APP_PATH/Contents/Frameworks/libcrypto.3.dylib"
lipo -create /opt/homebrew/opt/openssl@3/lib/libssl.3.dylib /tmp/openssl-x86_64/lib/libssl.3.dylib \
  -output "$APP_PATH/Contents/Frameworks/libssl.3.dylib"

# 5. 修复库链接路径
install_name_tool -id "@rpath/libcrypto.3.dylib" "$APP_PATH/Contents/Frameworks/libcrypto.3.dylib"
install_name_tool -id "@rpath/libssl.3.dylib" "$APP_PATH/Contents/Frameworks/libssl.3.dylib"
install_name_tool -change /opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib \
  "$APP_PATH/Contents/Frameworks/libssl.3.dylib"
for bin in "$APP_PATH/Contents/MacOS/code-moss" "$APP_PATH/Contents/MacOS/code_moss_daemon"; do
  install_name_tool -add_rpath "@executable_path/../Frameworks" "$bin" 2>/dev/null
  install_name_tool -change /opt/homebrew/opt/openssl@3/lib/libssl.3.dylib @rpath/libssl.3.dylib "$bin" 2>/dev/null
  install_name_tool -change /opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib "$bin" 2>/dev/null
done

# 6. 代码签名 (hardened runtime)
IDENTITY="Developer ID Application: kunpeng zhu (RLHBM56QRH)"
ENTITLEMENTS="src-tauri/Entitlements.plist"
codesign --force --options runtime --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp "$APP_PATH/Contents/Frameworks/libcrypto.3.dylib"
codesign --force --options runtime --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp "$APP_PATH/Contents/Frameworks/libssl.3.dylib"
codesign --force --options runtime --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp "$APP_PATH/Contents/MacOS/code-moss"
codesign --force --options runtime --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp "$APP_PATH/Contents/MacOS/code_moss_daemon"
codesign --force --options runtime --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp "$APP_PATH"

# 7. 生成 DMG
rm -rf release-local/dmg-root && mkdir -p release-local/dmg-root
ditto "$APP_PATH" release-local/dmg-root/CodeMoss.app
hdiutil create -volname "CodeMoss" -srcfolder release-local/dmg-root -ov -format UDZO \
  release-local/CodeMoss_<版本号>_universal.dmg

# 8. 公证 + 装订
xcrun notarytool submit release-local/CodeMoss_<版本号>_universal.dmg \
  --keychain-profile "CodeMoss-Notarize" --wait
xcrun stapler staple release-local/CodeMoss_<版本号>_universal.dmg
```

### 产物说明

| 文件 | 适用范围 | 大小 |
|-----|---------|------|
| `CodeMoss_<版本>_aarch64.dmg` | 仅 Apple Silicon (M1/M2/M3/M4) | ~16 MB |
| `CodeMoss_<版本>_universal.dmg` | 所有 Mac (Intel + Apple Silicon) | ~33 MB |

### 注意事项

- `.p8` API 私钥文件仅自己使用，不要分发给他人
- 未公证的应用在其他人 Mac 上会被 Gatekeeper 拦截
- `/tmp/openssl-x86_64` 是临时目录，重启后会清除，打包 Universal 版前需重新准备
- `TAURI_SIGNING_PRIVATE_KEY` 错误可忽略，仅影响自动更新功能，不影响打包
- 发布给用户只需发送 DMG 文件即可

## 项目结构

```
src/                    # React 前端代码
src-tauri/              # Rust/Tauri 后端代码
  src/                  # Rust 源码
  Cargo.toml            # Rust 依赖配置
  tauri.conf.json       # Tauri 主配置 (macOS/Linux)
  tauri.windows.conf.json  # Windows 配置
  Entitlements.plist    # macOS 权限声明
  Info.plist            # macOS 应用信息
scripts/                # 构建辅助脚本
  macos-fix-openssl.sh  # OpenSSL 捆绑和签名脚本
  doctor.sh             # 环境检查脚本
release-local/          # 本地打包产物 (不提交到 git)
```
