# Hifz - mémoriser n'importe quel texte en le récitant

Une application web inspirée de la fonction mémorisation de Tarteel, mais pour **n'importe quel texte** : un PDF, un poème, un matn, un cours.
Tu actives le micro et tu récites. Les mots apparaissent au fur et à mesure, et chaque faute est signalée tout de suite.

## Ce que fait Tarteel (et ce qu'on reproduit)

| Tarteel (Coran) | Hifz (n'importe quel texte) |
|---|---|
| Mode mémorisation : les versets sont cachés, chaque mot apparaît quand tu le récites | Oui : mode "Mémorisation", les mots sont des cases grises qui se révèlent |
| Détection des fautes : mot erroné, mot oublié | Oui : faute en rouge (le bon mot est révélé), oubli en orange barré |
| Alerte immédiate (vibration ou son) | Oui : petit son et animation à chaque faute (désactivable) |
| Suivi de lecture : le texte reste visible, le mot courant est suivi | Oui : mode "Lecture" |
| Indice / jeter un œil sur le texte | Oui : bouton "Indice" (révèle le mot suivant) et "Voir" (maintenir) |
| Statistiques de session | Oui : justes, fautes, oublis, indices, précision, meilleur score |
| Écouter un récitateur | Oui : lien YouTube affiché dans l'app |
| Modèle de reconnaissance entraîné spécifiquement sur la récitation coranique | Non : on utilise la reconnaissance vocale générale du navigateur (voir les limites) |

## Utilisation

1. **Ajoute un texte** : importe un PDF ou colle le texte (un vers ou une phrase par ligne, c'est idéal).
2. **Vérifie les pages** : décoche la couverture ou le sommaire. Tu peux corriger le texte de chaque page.
3. **Récite** : choisis la langue, clique sur "Réciter", autorise le micro. Clique sur un mot pour commencer à partir de lui.

Les textes et les meilleurs scores sont gardés dans le navigateur (rien n'est envoyé sur un serveur par l'application).

## Lancer l'application

Aucune installation, c'est un site statique. Le micro n'est autorisé que sur `https://` ou `localhost`, donc :

```bash
cd recitation-app
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 dans Chrome ou Edge
```

Pour la mettre en ligne : GitHub Pages, Netlify ou Vercel, en publiant le dossier `recitation-app` tel quel.

Tests du moteur d'alignement : `node tests/engine.test.js`

## Comment ça marche

- `pdf-text.js` : extrait le texte du PDF page par page avec pdf.js (inclus dans `lib/`), recolle les mots coupés, retire en-têtes et numéros, corrige des défauts fréquents des PDF arabes, et **repère les pages illisibles**.
- `engine.js` : le cœur. Il compare chaque mot entendu au mot attendu après normalisation (minuscules, sans accents ni ponctuation, sans voyelles arabes), avec une tolérance réglable (distance de Levenshtein) :
  - mot attendu reconnu : **juste** ;
  - mot reconnu qui correspond à un mot plus loin : les mots entre les deux sont **oubliés** (ou **fautes** si un autre mot a été dit à leur place) ;
  - mot inconnu isolé ("euh") : ignoré ; deux mots inconnus de suite : **faute** sur le mot attendu ;
  - gère les mots coupés ou collés par le micro ("quatre vingt" / "quatre-vingt").
- `app.js` : interface, micro (Web Speech API en continu, relancée automatiquement après un silence), saisie clavier de secours, bibliothèque, YouTube.

## Limites actuelles

- **PDF "dessinés"** : certains PDF (souvent ceux en arabe vocalisé faits avec InDesign) dessinent les lettres et les voyelles comme des formes séparées. Le texte n'est alors pas récupérable par un ordinateur. L'app le détecte et marque ces pages "illisible" : il faut coller le texte depuis une source propre (Wikisource, al-Maktaba al-Shamila, etc.). C'est le cas du PDF d'*al-Murshid al-Mu'in* testé : les pages de présentation passent, mais les 21 pages de vers sont illisibles.
- **Navigateurs** : la reconnaissance vocale marche dans Chrome et Edge (ordinateur et Android). Safari est partiel, Firefox ne la propose pas. Sans micro, on peut taper les mots.
- **Confidentialité** : dans Chrome, l'audio est transcrit par les serveurs de Google.
- **Précision** : la reconnaissance générale est moins fiable sur la poésie classique ou la récitation psalmodiée qu'un modèle spécialisé comme celui de Tarteel. Le réglage "Tolérante" aide.

## Pistes pour la suite

1. Reconnaissance plus précise et hors ligne : Whisper (modèle `whisper-small` ou un modèle arabe affiné) dans le navigateur via transformers.js, ou côté serveur.
2. OCR des PDF illisibles (Tesseract ou une API de vision) pour ne plus avoir à coller le texte.
3. Synchroniser la vidéo YouTube avec le texte (horodatage par vers) pour écouter puis répéter vers par vers.
4. Révision espacée : reproposer en priorité les passages avec le plus de fautes.
5. Comptes et synchronisation entre appareils.
