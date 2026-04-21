import type { LoadingProgressDialogConfig } from "../hooks/useLoadingProgressDialogState";

export type LoadingProgressController = {
  showLoadingProgressDialog: (config: LoadingProgressDialogConfig) => string;
  hideLoadingProgressDialog: (requestId: string) => void;
};

type LoadingActionOutcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown };

export async function runWithLoadingProgress<T>(
  controller: LoadingProgressController,
  config: LoadingProgressDialogConfig,
  action: () => Promise<T>,
): Promise<T> {
  const requestId = controller.showLoadingProgressDialog(config);
  let actionOutcome: LoadingActionOutcome<T>;

  try {
    actionOutcome = { status: "fulfilled", value: await action() };
  } catch (error) {
    actionOutcome = { status: "rejected", error };
  }

  try {
    controller.hideLoadingProgressDialog(requestId);
  } catch (cleanupError) {
    if (actionOutcome.status === "fulfilled") {
      throw cleanupError;
    }
    console.error(
      "Failed to hide loading progress dialog after action failure",
      cleanupError,
    );
  }

  if (actionOutcome.status === "rejected") {
    throw actionOutcome.error;
  }

  return actionOutcome.value;
}
