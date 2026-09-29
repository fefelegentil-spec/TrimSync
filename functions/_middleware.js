/* ── Fichiers internes jamais servis ──
   Cloudflare Pages publie tout le dépôt : sans ce garde-fou, le code du
   serveur (backend/), les notes (docs/, PRODUCT.md), les sources React et
   les fichiers de config étaient lisibles sur trimsync.tech. _routes.json
   limite cette fonction à ces chemins : le reste du site n'est pas touché. */
export async function onRequest() {
  return new Response('Introuvable', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
