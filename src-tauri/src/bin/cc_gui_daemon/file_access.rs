use super::*;
use crate::workspace_io::{
    list_external_absolute_directory_children_inner, list_external_spec_tree_inner,
    list_workspace_directory_children_inner, list_workspace_files_inner,
    read_external_absolute_file_inner, read_external_spec_file_inner, read_workspace_file_inner,
    write_external_absolute_file_inner, write_external_spec_file_inner, ExternalSpecFileResponse,
    WorkspaceFileResponse, WorkspaceFilesResponse,
};

impl DaemonState {
    pub(crate) async fn list_workspace_files(
        &self,
        workspace_id: String,
    ) -> Result<WorkspaceFilesResponse, String> {
        workspaces_core::list_workspace_files_core(&self.workspaces, &workspace_id, |root| {
            list_workspace_files_inner(root, 12_000)
        })
        .await
    }

    pub(crate) async fn list_workspace_directory_children(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<WorkspaceFilesResponse, String> {
        workspaces_core::read_workspace_file_core(
            &self.workspaces,
            &workspace_id,
            &path,
            |root, rel_path| list_workspace_directory_children_inner(root, rel_path, 2_000),
        )
        .await
    }

    pub(crate) async fn list_external_absolute_directory_children(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<WorkspaceFilesResponse, String> {
        let custom_skill_roots = {
            let app_settings = self.app_settings.lock().await;
            crate::skills::normalize_custom_skill_roots(
                app_settings.custom_skill_directories.clone(),
            )
        };
        let allowed_roots = {
            let workspaces = self.workspaces.lock().await;
            self.allowed_external_skill_roots(
                &workspaces,
                &workspace_id,
                &custom_skill_roots,
            )?
        };
        list_external_absolute_directory_children_inner(&path, &allowed_roots, 2_000)
    }

    pub(crate) async fn read_workspace_file(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<WorkspaceFileResponse, String> {
        workspaces_core::read_workspace_file_core(
            &self.workspaces,
            &workspace_id,
            &path,
            |root, rel_path| read_workspace_file_inner(root, rel_path),
        )
        .await
    }

    pub(crate) async fn list_external_spec_tree(
        &self,
        workspace_id: String,
        spec_root: String,
    ) -> Result<WorkspaceFilesResponse, String> {
        const MAX_EXTERNAL_SPEC_TREE_FILES: usize = 8_000;
        {
            let workspaces = self.workspaces.lock().await;
            if !workspaces.contains_key(&workspace_id) {
                return Err(format!("Workspace not found: {workspace_id}"));
            }
        }
        list_external_spec_tree_inner(&spec_root, MAX_EXTERNAL_SPEC_TREE_FILES)
    }

    pub(crate) async fn read_external_spec_file(
        &self,
        workspace_id: String,
        spec_root: String,
        path: String,
    ) -> Result<ExternalSpecFileResponse, String> {
        {
            let workspaces = self.workspaces.lock().await;
            if !workspaces.contains_key(&workspace_id) {
                return Err(format!("Workspace not found: {workspace_id}"));
            }
        }
        read_external_spec_file_inner(&spec_root, &path)
    }

    pub(crate) async fn read_external_absolute_file(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<WorkspaceFileResponse, String> {
        let custom_skill_roots = {
            let app_settings = self.app_settings.lock().await;
            crate::skills::normalize_custom_skill_roots(
                app_settings.custom_skill_directories.clone(),
            )
        };
        let allowed_roots = {
            let workspaces = self.workspaces.lock().await;
            self.allowed_external_skill_roots(
                &workspaces,
                &workspace_id,
                &custom_skill_roots,
            )?
        };
        read_external_absolute_file_inner(&path, &allowed_roots)
    }

    pub(crate) async fn write_external_spec_file(
        &self,
        workspace_id: String,
        spec_root: String,
        path: String,
        content: String,
    ) -> Result<(), String> {
        {
            let workspaces = self.workspaces.lock().await;
            if !workspaces.contains_key(&workspace_id) {
                return Err(format!("Workspace not found: {workspace_id}"));
            }
        }
        write_external_spec_file_inner(&spec_root, &path, &content)
    }

    pub(crate) async fn write_external_absolute_file(
        &self,
        workspace_id: String,
        path: String,
        content: String,
    ) -> Result<(), String> {
        let custom_skill_roots = {
            let app_settings = self.app_settings.lock().await;
            crate::skills::normalize_custom_skill_roots(
                app_settings.custom_skill_directories.clone(),
            )
        };
        let allowed_roots = {
            let workspaces = self.workspaces.lock().await;
            self.allowed_external_skill_roots(
                &workspaces,
                &workspace_id,
                &custom_skill_roots,
            )?
        };
        write_external_absolute_file_inner(&path, &allowed_roots, &content)
    }
}
