import { useCallback, useState } from "react";
import {
  readPanelLockPasswordFile,
  writePanelLockPasswordFile,
} from "../services/tauri";
import { PANEL_LOCK_INITIAL_PASSWORD } from "./utils";

type UsePanelLockStateResult = {
  isPanelLocked: boolean;
  setIsPanelLocked: (locked: boolean) => void;
  handleLockPanel: () => void;
  handleUnlockPanel: (password: string) => Promise<boolean>;
};

export async function verifyPanelUnlockPassword(
  password: string,
  readPassword: () => Promise<string | null>,
  writeInitialPassword: (password: string) => Promise<unknown> | unknown,
): Promise<boolean> {
  try {
    const filePassword = await readPassword();
    if (filePassword == null) {
      void writeInitialPassword(PANEL_LOCK_INITIAL_PASSWORD);
      return true;
    }
    const normalized = filePassword.trim();
    return normalized.length === 0 || password === normalized;
  } catch {
    // 读取异常时避免用户被锁死。
    return true;
  }
}

export function usePanelLockState(): UsePanelLockStateResult {
  const [isPanelLocked, setIsPanelLocked] = useState(false);

  const handleLockPanel = useCallback(() => {
    setIsPanelLocked(true);
  }, []);

  const handleUnlockPanel = useCallback(async (password: string) => {
    const unlocked = await verifyPanelUnlockPassword(
      password,
      readPanelLockPasswordFile,
      writePanelLockPasswordFile,
    );
    if (unlocked) {
      setIsPanelLocked(false);
    }
    return unlocked;
  }, []);

  return {
    isPanelLocked,
    setIsPanelLocked,
    handleLockPanel,
    handleUnlockPanel,
  };
}
