use std::collections::HashMap;

use tokio::sync::Mutex;

use crate::codex::collaboration_policy::normalize_mode;

#[derive(Debug, Default)]
pub(crate) struct ThreadModeState {
    modes: Mutex<HashMap<String, String>>,
}

impl ThreadModeState {
    pub(crate) async fn get(&self, thread_id: &str) -> Option<String> {
        let modes = self.modes.lock().await;
        modes.get(thread_id).cloned()
    }

    pub(crate) async fn set(&self, thread_id: impl Into<String>, mode: impl AsRef<str>) {
        let thread_id = thread_id.into();
        let normalized = normalize_mode(Some(mode.as_ref()));
        let mut modes = self.modes.lock().await;
        if let Some(value) = normalized {
            modes.insert(thread_id, value);
        } else {
            modes.remove(&thread_id);
        }
    }

    pub(crate) async fn remove(&self, thread_id: &str) {
        let mut modes = self.modes.lock().await;
        modes.remove(thread_id);
    }

    pub(crate) async fn inherit(
        &self,
        parent_thread_id: &str,
        child_thread_id: &str,
    ) -> Option<String> {
        let inherited = {
            let modes = self.modes.lock().await;
            modes.get(parent_thread_id).cloned()
        };
        if let Some(mode) = inherited.clone() {
            self.set(child_thread_id.to_string(), &mode).await;
        }
        inherited
    }
}

#[cfg(test)]
mod tests {
    use super::ThreadModeState;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn thread_mode_state_supports_concurrent_read_write() {
        let state = std::sync::Arc::new(ThreadModeState::default());
        let mut tasks = Vec::new();
        for index in 0..24 {
            let state = std::sync::Arc::clone(&state);
            tasks.push(tokio::spawn(async move {
                let thread_id = format!("thread-{index}");
                let mode = if index % 2 == 0 { "plan" } else { "code" };
                state.set(thread_id.clone(), mode).await;
                state.get(&thread_id).await
            }));
        }

        for (index, task) in tasks.into_iter().enumerate() {
            let observed = task.await.expect("join");
            let expected = if index % 2 == 0 { "plan" } else { "code" };
            assert_eq!(observed.as_deref(), Some(expected));
        }
    }

    #[tokio::test]
    async fn inherit_copies_parent_mode_to_child() {
        let state = ThreadModeState::default();
        state.set("thread-parent", "code").await;
        let inherited = state.inherit("thread-parent", "thread-child").await;
        assert_eq!(inherited.as_deref(), Some("code"));
        assert_eq!(state.get("thread-child").await.as_deref(), Some("code"));
    }
}
