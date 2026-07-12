// Widget Sleekplan (feedback bugs/suggestions).
// Le SDK se lie tout seul aux éléments porteurs d'un attribut `data-sleek` ;
// le bouton flottant par défaut est désactivé côté Sleekplan (Settings → Widget).

declare global {
  interface Window {
    $sleek?: unknown[];
    SLEEK_PRODUCT_ID?: number | string;
  }
}

const productId = import.meta.env.VITE_SLEEK_PRODUCT_ID as string | undefined;

export const sleekplanEnabled = Boolean(productId);

let injected = false;

export function initSleekplan(): void {
  if (!sleekplanEnabled || injected) return;
  injected = true;
  const numericId = Number(productId);
  window.$sleek = [];
  window.SLEEK_PRODUCT_ID = Number.isNaN(numericId) ? productId : numericId;
  const script = document.createElement("script");
  script.src = "https://client.sleekplan.com/sdk/e.js";
  script.async = true;
  // Le launcher flottant par défaut est masqué côté code : seul notre bouton
  // menubar (data-sleek) déclenche le widget, quel que soit le réglage Sleekplan.
  script.onload = () => {
    (window.$sleek as { hideButton?: () => void } | undefined)?.hideButton?.();
  };
  document.head.appendChild(script);
}
