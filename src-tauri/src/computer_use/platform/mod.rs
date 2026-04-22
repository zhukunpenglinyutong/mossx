#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

use super::{ComputerUseDetectionSnapshot, PlatformAdapterResult, PlatformAvailability};

pub(crate) fn platform_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        return "macos";
    }
    #[cfg(target_os = "windows")]
    {
        return "windows";
    }
    #[cfg(target_os = "linux")]
    {
        return "linux";
    }
    #[allow(unreachable_code)]
    "unknown"
}

pub(crate) fn detect_platform_state(
    snapshot: ComputerUseDetectionSnapshot,
) -> PlatformAdapterResult {
    #[cfg(target_os = "macos")]
    {
        return macos::detect(snapshot);
    }
    #[cfg(target_os = "windows")]
    {
        return windows::detect(snapshot);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return unsupported::detect(snapshot);
    }
}

#[cfg(not(target_os = "macos"))]
pub(super) fn unsupported_result(
    platform: &'static str,
    snapshot: ComputerUseDetectionSnapshot,
) -> PlatformAdapterResult {
    PlatformAdapterResult {
        platform,
        availability: PlatformAvailability::Unsupported,
        snapshot,
    }
}
