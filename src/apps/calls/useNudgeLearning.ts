import { useCallback } from "react";
import { useSession } from "../../auth/useSession";
import {
  markNudgeSeen,
  registerMouseClick,
  type ShortcutId,
} from "./nudgeLearning";

export function useNudgeLearning(shortcutId: ShortcutId): {
  onMouseClick: () => boolean;
  dismiss: () => void;
} {
  const { session } = useSession();
  const userId = session?.user?.id ?? "";

  const onMouseClick = useCallback((): boolean => {
    if (!userId) return false;
    const { shouldShow } = registerMouseClick(shortcutId, userId);
    return shouldShow;
  }, [shortcutId, userId]);

  const dismiss = useCallback((): void => {
    if (!userId) return;
    markNudgeSeen(shortcutId, userId);
  }, [shortcutId, userId]);

  return { onMouseClick, dismiss };
}
