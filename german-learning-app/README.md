# 🇩🇪 Deutsch von Null — Apprendre l'allemand de zéro

Application web pour apprendre l'allemand en partant de zéro, centrée sur les
**expressions les plus utilisées** et la **répétition espacée**.

## Fonctionnalités

- **10 leçons thématiques** (~100 expressions) dans l'ordre d'utilité :
  salutations, politesse, se présenter, questions essentielles, communication,
  nombres, restaurant, transports, urgences, quotidien.
- **Prononciation** : transcription phonétique « à la française » + audio
  (synthèse vocale allemande du navigateur, bouton 🔊).
- **Répétition espacée** (algorithme type SM-2) : chaque expression apprise
  devient une carte qui revient au bon moment (10 min → 1 j → 3 j → …) selon
  ta réponse (*Encore / Difficile / Bien / Facile*). Les cartes bien connues
  sont aussi testées dans le sens français → allemand.
- **Exercices** : QCM (choisir la bonne traduction) et écriture (taper
  l'expression en allemand, avec boutons ä ö ü ß et tolérance ae/oe/ue/ss).
- **Progression** : XP, série de jours consécutifs (🔥), avancement par leçon.
- **Hors-ligne et sans compte** : tout est sauvegardé dans le `localStorage`
  du navigateur. Aucune dépendance, aucun serveur.

## Utilisation

Ouvre simplement `index.html` dans un navigateur (double-clic suffit), ou
sers le dossier :

```bash
cd german-learning-app
python3 -m http.server 8080
# puis http://localhost:8080
```

## Structure

Un seul fichier `index.html` contient tout : les données des leçons
(`LESSONS`), la logique de répétition espacée (`grade`), les vues
(accueil, leçons, révision, exercices) et les styles (clair/sombre
automatique).

Pour ajouter du vocabulaire, ajoute des entrées `{de, fr, ph}` dans une
leçon existante ou une nouvelle leçon dans le tableau `LESSONS`.
