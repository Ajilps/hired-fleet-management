import { restoreSession } from "./auth-service";
import { useAuthStore } from "./auth-store";
export async function restoreAuthentication() {
  const revision = useAuthStore.getState().revision;
  try {
    const session = await restoreSession();
    if (useAuthStore.getState().revision !== revision) return;
    if (session) useAuthStore.getState().accept(session);
    else useAuthStore.getState().clear();
  } catch {
    if (
      useAuthStore.getState().revision === revision &&
      !useAuthStore.getState().session
    )
      useAuthStore.getState().restoreError();
  }
}
