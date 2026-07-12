// Préchargement des chunks lazy au mount du Desktop, pour que l'ouverture
// d'une app (via raccourci, dock ou launcher) soit instantanée plutôt que
// d'attendre le téléchargement du bundle. Les chemins DOIVENT correspondre à
// ceux utilisés dans registry.tsx — si tu ajoutes une app, ajoute-la ici aussi.

// Production apps
void import("../apps/calls/CallManagerApp");
void import("../apps/cleaner/CleanerApp");
void import("../apps/weekly/WeeklyApp");
void import("../apps/hub/HubApp");

// Demo apps (DEV only — gate dynamic import to avoid bundling in prod)
if (import.meta.env.DEV) {
  void import("../apps/demo/OverviewDemo");
  void import("../apps/demo/NotesDemo");
  void import("../components/ui/demo");
}