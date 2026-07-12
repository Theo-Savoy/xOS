// App Feedback : board Sleekplan embarqué en iframe.
// Réf : https://sleekplan.com/docs/install/iframe — l'app n'apparaît dans le
// registry que si VITE_SLEEK_PRODUCT_ID (Settings → Widget) est défini.

const productId = import.meta.env.VITE_SLEEK_PRODUCT_ID as string | undefined;

export const sleekplanEnabled = Boolean(productId);

export const sleekplanEmbedUrl = `https://embed-${productId ?? ""}.sleekplan.app/?full=true#/feedback/`;
