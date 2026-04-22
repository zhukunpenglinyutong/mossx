use crate::computer_use::ComputerUseDetectionSnapshot;

use super::{unsupported_result, PlatformAdapterResult};

pub(super) fn detect(snapshot: ComputerUseDetectionSnapshot) -> PlatformAdapterResult {
    unsupported_result("windows", snapshot)
}
