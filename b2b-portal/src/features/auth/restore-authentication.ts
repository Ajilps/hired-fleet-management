import { restoreSession } from "./auth-service";
import { useAuthStore } from "./auth-store";
export async function restoreAuthentication() {
  const state = useAuthStore.getState();
  const revision = state.revision;
  if (!state.session || Date.parse(state.session.accessTokenExpiresAt) <= Date.now())
    state.beginRestore();
  try {
    const session = await restoreSession();
    if (useAuthStore.getState().revision !== revision) return;
    if (session) useAuthStore.getState().accept(session);
    else useAuthStore.getState().clear();
  } catch {
    const current = useAuthStore.getState();
    if (current.revision === revision &&
      (!current.session || Date.parse(current.session.accessTokenExpiresAt) <= Date.now()))
      current.restoreError();
  }
}
