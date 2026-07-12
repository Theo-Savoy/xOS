import { supabase } from "../lib/supabase";

export type DesktopShortcut = {
  id: number;
  app_id: string;
  params: Record<string, string>;
  label: string;
};

// Événement fenêtre pour rafraîchir le Desktop quand une app épingle/retire
// un raccourci (plus simple qu'un canal realtime pour un usage mono-onglet).
export const SHORTCUTS_CHANGED_EVENT = "xos:shortcuts-changed";

function notifyChanged() {
  window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT));
}

export async function fetchShortcuts(): Promise<DesktopShortcut[]> {
  const { data, error } = await supabase
    .from("desktop_shortcuts")
    .select("id, app_id, params, label")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    params: (row.params ?? {}) as Record<string, string>,
  }));
}

export async function addShortcut(
  appId: string,
  params: Record<string, string>,
  label: string,
): Promise<void> {
  const { error } = await supabase
    .from("desktop_shortcuts")
    .insert({ app_id: appId, params, label });
  // 23505 : déjà épinglé (index unique owner+app+params) — considéré comme un succès.
  if (error && error.code !== "23505") throw error;
  notifyChanged();
}

export async function removeShortcut(id: number): Promise<void> {
  const { error } = await supabase.from("desktop_shortcuts").delete().eq("id", id);
  if (error) throw error;
  notifyChanged();
}
