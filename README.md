# 🍿 MovieMatch

A private movie-list tracker for two people, with personal lists, shared lists, a dashboard for each person, and Tinder-style swiping for nights when you can't agree on a movie.

## Features

- **Two accounts only.** The first two people to sign up are the only users. After that, sign-up closes.
- **Personal and joint lists.** Each person gets a personal watchlist, and the two of you share one joint list. You can create more of either kind.
  - You can edit your own personal lists. Your partner can see them but can't change them.
  - Both of you can add to and edit joint lists. Each movie shows who added it.
- **Add a movie by name.** Type a title and press Enter, or pick from the suggestions that appear as you type. MovieMatch fills in from [TMDB](https://www.themoviedb.org/):
  - poster, backdrop, year, runtime, rating, age rating, genres and tagline
  - credits: director, writers and the main cast with photos
  - the trailer, playing inside the app (YouTube)
- **Home (a "marquee" layout).**
  - A large backdrop features tonight's pick. If nothing is picked yet, it features a film you both want, or one from your joint list, and the choice changes daily.
  - **Watch tonight** sets the pick for both of you. **Play trailer** and **We watched it** follow; marking it watched clears the pick.
  - The match button sits right beside it, showing how many movies you have left to swipe.
  - Rows of posters follow. Your joint lists come first, then films on both your lists, then your partner's picks and yours (each film appears in only one row).
  - At the bottom, a "taste check" compares each person's favourite genres.
- **Match mode (Tinder-style).**
  1. One of you starts a round. You can limit it by mood (genres), maximum length, and which lists to use.
  2. You each swipe through the same set of unwatched movies taken from both people's lists. Drag the card, tap ✕ / ♥, or use the ← / → keys (↑ shows details, Backspace undoes).
  3. **The two lists are compared to order the cards.** Movies the other person has already liked come first, so you find a match sooner. After those come movies from your partner's list that aren't on yours, then movies you both picked, then your own.
  4. When you both like a movie, both screens show **It's a match!** right away.
  5. Choose one match as **tonight's pick**, or press 🎲 to let the app choose from your matches.
  6. If you finish with no matches, the app shows **near misses** (movies only one of you liked) as possible compromises.
- Mark a movie as watched. Watched movies are left out of later match rounds.
- **Add a movie from anywhere.** Use the "Add a movie" button in the header, the + in the phone tab bar, or press `/`. Pick a list, type a title, and keep adding.
- **Remove with undo.** Removing a film happens straight away, with an Undo button for a few seconds.

## Forgotten passwords

Only two accounts can exist, so a forgotten password can't be fixed by signing up again. There are two ways back in:

- **In the app:** your partner taps their initials (top right), then **Reset your partner's password**. They get a one-time temporary password to give you. Signing in with it asks you to choose a new password before anything else works, and it signs you out on other devices.
- **On the server:** if neither of you can sign in, run `npm run reset-password -- <username>`. It prints a one-time temporary password that works the same way.

You can change your own password any time from the same menu.

## Quick start

You need **Node.js 22.5 or newer**. The app uses Node's built-in SQLite, so you don't need to install a database.

```bash
npm install
cp .env.example .env      # then paste your TMDB key into .env
npm start                 # http://localhost:3000
```

Open the site and create the first account. Your partner then opens the same address and creates the second account.

### Getting a TMDB key (free)

1. Create an account at https://www.themoviedb.org/signup.
2. Go to **Settings → API** and request an API key (choose "Developer", personal use).
3. Put the **API Key** in `.env` as `TMDB_API_KEY=...`. You can use the **API Read Access Token** instead, as `TMDB_READ_TOKEN=...`.

**Keep the key private.** It only ever lives in `.env`, which git ignores, so it is never committed. Only the server talks to TMDB, so the key is never sent to anyone's browser. Don't paste it into code, issues or chat. If it leaks, generate a new one on the same TMDB settings page.

If your server reaches the internet through an HTTPS proxy, start it with `NODE_USE_ENV_PROXY=1 npm start` so Node uses the proxy.

**Without a key, the app runs in demo mode** with about 20 built-in movies. This is handy for trying it out. You can add a key later. Movies you added in demo mode stay on your lists.

## Configuration (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | — | TMDB credentials (use one of them) |
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/moviematch.db` | SQLite database file |
| `DEMO_MODE` | — | Set to `1` to use the demo catalog even when a key is set |
| `SECURE_COOKIES` | — | Set to `1` when the site is served over HTTPS |

## Deploying so you can both use it

Both people need to reach the same server. Options:

- **A home computer or Raspberry Pi** on your Wi-Fi: run `npm start` and open `http://<that-machine's-ip>:3000` on both phones.
- **A small cloud host** that runs Node and gives you a persistent disk (Render, Railway, Fly.io, a VPS). Point `DB_PATH` at the persistent disk, and set `SECURE_COOKIES=1` once the site uses HTTPS.

On a phone you can add the site to your home screen so it works like an app.

## Project layout

```
server/
  index.js         entry point (loads .env, opens DB, starts Express)
  app.js           all API routes, the dashboard, and the matching engine
  db.js            SQLite schema
  tmdb.js          TMDB client (search, details + credits + trailer) and demo provider
  demo-catalog.js  built-in movies for demo mode
public/            single-page frontend (plain JS, no build step)
test/api.test.js   end-to-end API tests (node:test)
```

## API overview

All routes are JSON. Every route except `status`, `register` and `login` requires you to be signed in (a session cookie).

| Method & path | What it does |
| --- | --- |
| `GET /api/status` | Whether sign-up is open, demo or TMDB mode, and the current user |
| `POST /api/auth/register` · `login` · `logout` | Accounts |
| `GET /api/dashboard` | Everything the dashboard shows |
| `GET /api/movies/search?q=` | Search for movies by title |
| `GET /api/movies/:id` | Full details, credits and trailer, plus the lists the movie is on |
| `POST /api/movies/:id/watched` | Mark watched or unwatched on every list |
| `GET/POST /api/lists`, `GET/PATCH/DELETE /api/lists/:id` | Lists |
| `POST /api/lists/:id/items` | Add a movie, by `{ title }` or `{ tmdbId }` |
| `PATCH/DELETE /api/lists/:id/items/:itemId` | Mark watched, add a note, or remove |
| `POST /api/match/rounds` | Start a round, with optional `{ genres, maxRuntime, listIds }` |
| `GET /api/match` · `GET /api/match/deck` | Round progress and matches · your next cards |
| `POST /api/match/swipe` · `undo` · `choose` · `end` | Swipe, undo, pick tonight's movie, end the round |

## Tests

```bash
npm test
```

---

The staggered poster reveal and the inline form-error pattern are adapted from [Toggle Supply](https://www.toggle.supply/) (MIT License, Copyright (c) 2025 Toggle Supply).

This product uses the TMDB API but is not endorsed or certified by TMDB. The logo is set in [Gloock](https://github.com/duartp/gloock) and titles in [Big Shoulders Display](https://github.com/xotypeco/big_shoulders), both bundled under the SIL Open Font License 1.1 (`public/fonts/*-OFL.txt`).
