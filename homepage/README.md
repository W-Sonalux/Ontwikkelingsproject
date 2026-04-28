# SOZZIAL — Homepagina

Centrale homepagina voor de SOZZIAL interactieve spelletjestafel. De pagina biedt twee spelers de mogelijkheid om gezamenlijk een spel te kiezen via drie selectiemodi.

## Poorten

| Server          | Poort |
|-----------------|-------|
| Homepagina      | 8080  |
| Stokvangen      | 3000  |
| Memory          | 3001  |
| 4 op een rij    | 3002  |

## Installatie & starten

```bash
cd homepage/backend
npm install
node server.js
```

De server is daarna bereikbaar op:

- **Speler 1** (linkerscherm): `http://localhost:8080/player1`
- **Speler 2** (rechterscherm): `http://localhost:8080/player2`

## Selectiemodi

De schakelaar op het scherm van speler 1 biedt drie modi:

| Modus | Beschrijving |
|-------|-------------|
| **Speler 1 kiest** | Alleen speler 1 kan een spel aanklikken. Zodra speler 1 klikt, starten beide schermen het spel. Speler 2 ziet de kaartjes grijs. |
| **Stemmen** | Beide spelers stemmen op een spel. Het spel met de meeste stemmen wint. Bij gelijkstand wint de eerste stem. Spelers kunnen hun stem wijzigen totdat beide hebben gestemd. |
| **Wie het eerst klikt** | Beide spelers zien dezelfde spelkaartjes. Het eerste spel dat door iemand wordt aangeklikt wordt gestart. |

## Mapstructuur

```
homepage/
├── backend/
│   ├── server.js        ← Express + Socket.io server (poort 8080)
│   └── package.json
└── frontend/
    ├── player1.html     ← Scherm speler 1 (met modus-schakelaar)
    ├── player2.html     ← Scherm speler 2 (alleen spelkaartjes)
    ├── style.css        ← Donker, modern design
    └── game.js          ← Socket.io spelkeuze logica
```
