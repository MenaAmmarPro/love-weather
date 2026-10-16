# Same Sky — love-weather

Live weather for both ends of the love story: **Karachi** and **Bucharest**,
side by side, under one sky.

Live: https://menaammarpro.github.io/love-weather/

- Data: [Open-Meteo](https://open-meteo.com/) — free, no API key, CORS-friendly.
- Two city cards: local time, current temp (+feels-like, wind), 3-day strip.
- The "diff line" says which city is warmer right now, in °C or °F
  (toggle button, stored in localStorage `mena-weather`).
- Auto-refreshes every 10 minutes; tapping a card forces a refresh.
- Offline fallback: each card shows the monthly climatological high with a
  small note, so the page is never blank.

Made with love, just for you ♥
