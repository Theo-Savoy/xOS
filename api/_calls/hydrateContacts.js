import { fetchContactBasicsByIds } from "../_crm/salesforce.js";

const hydrationAttempts = new Set();
const MAX_HYDRATION_ATTEMPTS = 5000;

/** Test-only helper to clear contacts already attempted in this warm container. */
export function __resetHydrationAttempts() {
  hydrationAttempts.clear();
}

/** Fills missing email/title on session rows from CRM and persists updates. */
export async function hydrateSessionContactsFromCrm(client, contacts, accessToken, mapping) {
  if (!contacts?.length || !accessToken) return contacts;

  const needsHydration = contacts.filter(
    (contact) => (!contact.email || !contact.title) && !hydrationAttempts.has(contact.id),
  );
  if (!needsHydration.length) return contacts;

  if (hydrationAttempts.size >= MAX_HYDRATION_ATTEMPTS) hydrationAttempts.clear();
  for (const contact of needsHydration) hydrationAttempts.add(contact.id);

  const ids = [...new Set(needsHydration.map((contact) => contact.sf_contact_id))];
  const lookup = await fetchContactBasicsByIds(accessToken, ids, mapping);
  if (lookup.error) return contacts;

  const updates = [];
  const enriched = contacts.map((contact) => {
    const basics = lookup.byId.get(contact.sf_contact_id);
    if (!basics) return contact;

    const patch = {};
    if (!contact.email && basics.email) patch.email = basics.email;
    if (!contact.title && basics.title) patch.title = basics.title;
    if (!Object.keys(patch).length) return contact;

    updates.push({ id: contact.id, ...patch });
    return { ...contact, ...patch };
  });

  if (updates.length && client) {
    await Promise.all(
      updates.map((row) => {
        const { id, ...fields } = row;
        return client.from("call_session_contacts").update(fields).eq("id", id);
      }),
    );
  }

  return enriched;
}
