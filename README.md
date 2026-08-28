# HoverGPT

Extension Chrome minimaliste avec deux comportements seulement.

## Utilisation

- Clic sur le bouton de l'extension : capture l'onglet visible, analyse uniquement le cas "une seule question QCM a choix unique", puis affiche l'emoji correspondant sur le badge de l'extension.
- Microswipe sur la page : capture l'onglet visible et affiche une reponse longue dans le popup Shadow DOM.
- Touche `Tab` : meme effet que le microswipe.
- Touche `q` : active ou desactive le microswipe sur la page courante.

## Mapping QCM

- A = 🌲
- B = 🍌
- C = 🍒
- D = 🐬
- E = 🐌
- F = 🍓
- Autres lettres = la lettre directement

Si la capture ne correspond pas clairement a une seule question QCM a choix unique, le badge affiche `?`.

## Fichiers

- `manifest.json` : declaration de l'extension.
- `background.js` : capture d'ecran, appel backend, badge emoji.
- `content.js` : detection du microswipe et popup de reponse longue.
- `worker/worker.js` : backend Cloudflare Worker avec deux modes, `choice` et `long`.
