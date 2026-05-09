use super::*;

impl DaemonState {
    pub(crate) async fn list_workspace_session_folders(
        &self,
        workspace_id: String,
    ) -> Result<session_management::WorkspaceSessionFolderTree, String> {
        session_management::list_workspace_session_folders_core(
            &self.workspaces,
            self.storage_path.as_path(),
            workspace_id,
        )
        .await
    }

    pub(crate) async fn create_workspace_session_folder(
        &self,
        workspace_id: String,
        name: String,
        parent_id: Option<String>,
    ) -> Result<session_management::WorkspaceSessionFolderMutation, String> {
        session_management::create_workspace_session_folder_core(
            &self.workspaces,
            self.storage_path.as_path(),
            workspace_id,
            name,
            parent_id,
        )
        .await
    }

    pub(crate) async fn rename_workspace_session_folder(
        &self,
        workspace_id: String,
        folder_id: String,
        name: String,
    ) -> Result<session_management::WorkspaceSessionFolderMutation, String> {
        session_management::rename_workspace_session_folder_core(
            &self.workspaces,
            self.storage_path.as_path(),
            workspace_id,
            folder_id,
            name,
        )
        .await
    }

    pub(crate) async fn move_workspace_session_folder(
        &self,
        workspace_id: String,
        folder_id: String,
        parent_id: Option<String>,
    ) -> Result<session_management::WorkspaceSessionFolderMutation, String> {
        session_management::move_workspace_session_folder_core(
            &self.workspaces,
            self.storage_path.as_path(),
            workspace_id,
            folder_id,
            parent_id,
        )
        .await
    }

    pub(crate) async fn delete_workspace_session_folder(
        &self,
        workspace_id: String,
        folder_id: String,
    ) -> Result<(), String> {
        session_management::delete_workspace_session_folder_core(
            &self.workspaces,
            self.storage_path.as_path(),
            workspace_id,
            folder_id,
        )
        .await
    }

    pub(crate) async fn assign_workspace_session_folder(
        &self,
        workspace_id: String,
        session_id: String,
        folder_id: Option<String>,
    ) -> Result<session_management::WorkspaceSessionAssignmentResponse, String> {
        session_management::assign_workspace_session_folder_core(
            &self.workspaces,
            &self.engine_manager,
            self.storage_path.as_path(),
            workspace_id,
            session_id,
            folder_id,
        )
        .await
    }
}
