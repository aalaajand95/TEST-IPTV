# Souq TV · سوق تي في

An Arabic-first IPTV platform: live Arabic channels with a TV guide, a library of Arabic movies and series, plus English movies and series, Turkish drama and anime. The interface is bilingual (Arabic RTL and English) and works on desktop and mobile.

> **Content and licensing.** Souq TV is a *platform*. It does not host, sell or bundle any streams.
> Content comes from sources you connect:
>
> - **Free-to-air channels** that broadcasters stream publicly, indexed by [iptv-org](https://github.com/iptv-org/iptv). This source is enabled by default and covers all 22 Arab League countries plus the Arabic-language index.
> - **Your IPTV provider**, through **Xtream Codes** login or an **M3U playlist**. This is where the large movie/series/anime library and premium channels (MBC, OSN, beIN, Shahid, etc.) come from. Connect only providers you hold a licence or subscription for.
> - **TMDB** for metadata only: posters, overviews, cast, trailers and the Discover rows. Titles a source can't play are labelled as such.
>
> If you plan to run this as a commercial service, you need distribution rights for the channels and titles you serve. That is a business and legal problem the code can't solve.

## Features

- **Live TV**: Arabic and all-channel views, category filters (news, sports, kids, religious, drama, movies…) and country filters with counts, now/next from XMLTV EPG, and a programme guide per channel.
- **Library**: movies and series from your providers. They're automatically sorted into **Arabic / English / Turkish / Anime / World** using provider category conventions (`AR |`, `EN -`, `|TR|`, `أفلام`…), Arabic script detection and TMDB language data.
- **Series**: seasons and episodes. Xtream episodes load lazily. M3U episodes (`Show S01E02`) are grouped into shows automatically. TMDB episode titles and stills are merged in, and episodes your source doesn't have are marked as unavailable.
- **Discover rows** (needs a TMDB key): Arabic series, Arabic movies, Egyptian cinema classics, Gulf drama, Turkish drama, trending movies, popular series, anime and family titles. Each title is matched against your library by TMDB id, or by Arabic or English title plus year.
- **Search**: one search box across channels, library and TMDB. It ignores Arabic diacritics and letter variants (أ/إ/ا, ة/ه, ى/ي).
- **Playback**: hls.js (native HLS on Safari/iOS) and progressive MP4/MKV. If the browser can't play a stream directly (CORS, http on an https page, streams that need a User-Agent/Referer), it falls back to a signed stream proxy.
- **My List** and **Continue Watching** with resume and auto-advance to the next episode.
- **Source management UI**: add, disable, refresh and remove sources, with per-source status and counts. One failing source never blanks the others; the last good copy is kept.

## Quick start

Requires Node.js 22.9+.

```bash
cp .env.example .env        # add TMDB_API_KEY for posters, metadata and Discover rows
npm install
npm run dev                 # API on :8080, web app on http://localhost:5173
```

Production:

```bash
npm run build && npm start  # serves the API and the built web app on :8080
# or
docker compose up --build
```

On first start the app seeds two sources: **Demo content** (openly licensed Blender films and test streams, so the UI works immediately) and **Free-to-air Arabic channels**. Turn the demo off with `DEMO=0` or remove it in Settings.

### Connecting a provider

Go to **Settings → Add source**:

| Type | What you need |
| --- | --- |
| Xtream Codes | Server URL (`http://host:port`), username, password. Loads live, VOD, series and EPG. |
| M3U | Playlist URL; optional XMLTV URL and User-Agent. Movies and series in the playlist are detected by URL (`/movie/`, `/series/`, `.mp4`, `.mkv`) and grouped. |
| Free-to-air | iptv-org language codes (`ara`, `eng`) and/or country codes (`sa eg ae …`). |

Passwords are never returned by the API. Set `ADMIN_TOKEN` to require a token for any source change.

## Configuration

See [.env.example](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | – | Enables metadata, trailers and Discover |
| `DATA_DIR` | `./data` | Where sources, favourites and progress are stored (`db.json`) |
| `ADMIN_TOKEN` | – | Protects source management endpoints |
| `STREAM_PROXY` | `fallback` | `off`: browser always plays upstream URLs. `fallback`: try direct, then the proxy. `on`: always proxy. Proxying uses server bandwidth. |
| `PROXY_SECRET` | random | HMAC key for proxy URLs. Set it so proxy links survive restarts. |
| `REFRESH_MINUTES` | `360` | Source re-fetch interval |
| `DEMO` | `1` | Seed the demo source on first run |

## Architecture

```
server/                         Express 5 + TypeScript
  src/lib/m3u.ts                Extended M3U parser (EXTVLCOPT, Kodi pipe headers, EXTGRP) → channels, movies, series
  src/lib/xtream.ts             Xtream Codes player_api client
  src/lib/xmltv.ts              XMLTV EPG parser (gzip-aware, windowed)
  src/lib/tmdb.ts               TMDB client + Discover row definitions (cached)
  src/lib/classify.ts           Arabic detection, audience + channel category inference, title normalisation
  src/services/sources.ts       Loads/refreshes sources independently, merges indexes, lazy episodes
  src/services/catalog.ts       Library/channel queries, TMDB matching, home rows, detail/season merge
  src/services/streams.ts       Stream resolution + signed HLS-rewriting proxy
  src/services/store.ts         JSON file store (sources, favourites, progress)
  src/routes/api.ts             REST API (zod-validated)
web/                            React 19 + Vite + react-router, hls.js loaded on demand
```

Stream URLs (which embed provider credentials) only leave the server through `/api/play/:id`, when playback starts. Catalog endpoints never include them, and a test enforces this.

### API

`GET /api/home` · `/api/channels` · `/api/channels/facets` · `/api/channels/:id` · `/api/library` · `/api/library/facets` · `/api/discover` · `/api/discover/:row` · `/api/title/:id` · `/api/title/:id/season/:n` · `/api/search` · `/api/play/:id` · `/api/proxy`
`GET/POST/PATCH/DELETE /api/sources[/:id]` · `POST /api/sources/:id/refresh`
`GET/PUT/DELETE /api/favorites[/:id]` · `GET/PUT/DELETE /api/progress[/:id]`

Most read endpoints take `lang=ar|en` for TMDB metadata language.

## Development

```bash
npm test            # server unit + API tests (vitest, no network needed)
npm run typecheck
```

## Roadmap ideas

- User accounts and profiles (kids profile with category locks), moving storage from JSON to Postgres/SQLite
- Catch-up / timeshift for Xtream `tv_archive` channels
- Subtitles and audio-track picker (Arabic dub vs. original)
- TV apps: Android TV / Fire TV, Samsung Tizen, LG webOS (the web app is a good base for Tizen/webOS)
- PWA install and Chromecast / AirPlay
- Ramadan season hub (daily new episodes from the series schedule)
