# Meditron site

Static site (GitHub Pages ready): `index.html`, `static/style.css`, `static/app.js`.

- Globe: d3 orthographic projection of `static/data/land-110m.json` (world-atlas), stipple-dithered on a canvas each frame. Amber squares are MOOVE event sites (`SITES` in `app.js`).
- Folders: the five project folders in the hero; each opens `<template id="tpl-NAME">` in the dialog via `#NAME`.
- AutoMOOVE game: `static/data/clinician_rounds.json`, 5 pairs from `meditron-4/data/moove/moove_eval_unanimous_576.jsonl` joined with the Gemma-4-31B log-prob judge verdicts (`auto_moove/judge_outputs/judged_unanimous576_winner_logprob_bidir_gemma4_31b.jsonl`). Judge agreement over all 576: 455 (79%).
- Chat: `server/chat_server.py` serves the site and relays `/api/chat` to RCP (`https://inference-rcp.epfl.ch/v1`, model `EPFLiGHT/Apertus-70B-MeditronFO`). It holds `RCP_API_KEY`, pins temperature 0.7 and max_tokens 2048 (RCP's default temperature 1.0 is what truncated MeditronFO on MOOVE; see `meditron-4/truncation/README.md`), serves one request at a time (the key allows one in flight), and rate-limits per client. The page enables the chat only if `GET api/chat` answers, so a static-only host shows "not connected". Answers render as sanitised markdown (marked + DOMPurify).

Run it:

    set -a; . ~/meditron-4/.env; set +a
    python3 server/chat_server.py --port 8000

For a page hosted elsewhere (e.g. GitHub Pages), set `CHAT.endpoint` in `app.js` to the server's full URL and start it with `--allow-origin https://<pages-origin>`; behind a reverse proxy add `--trust-proxy`.
