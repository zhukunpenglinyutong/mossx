#[cfg(not(target_os = "windows"))]
#[path = "real.rs"]
mod imp;

#[cfg(target_os = "windows")]
#[path = "stub.rs"]
mod imp;

pub(crate) use imp::*;
