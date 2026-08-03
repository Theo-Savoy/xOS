import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Port fixe et strict : Empire occupe déjà 5173. Le port du dashboard doit
    // être déterministe car le tunnel webhook Telnyx pointe dessus
    // (cloudflared --url http://localhost:5174). strictPort échoue bruyamment
    // au lieu de silencieusement prendre un autre port.
    port: 5174,
    strictPort: true,
    // Le tunnel cloudflared (webhook Telnyx) envoie un Host
    // <random>.trycloudflare.com qui change à chaque lancement. Autoriser le
    // pattern entier plutôt que chaque host individuel, sinon la config casse
    // dès que le tunnel est relancé.
    allowedHosts: ['.trycloudflare.com'],
  },
});
