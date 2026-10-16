"use strict";

/*
 * love-weather — "Same Sky": live weather for Karachi and Bucharest.
 *
 * Data: Open-Meteo (free, no API key, CORS-friendly):
 *   https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..
 *     &current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m
 *     &daily=weather_code,temperature_2m_max,temperature_2m_min
 *     &forecast_days=3&timezone=auto
 *
 * If the network is down, each city falls back to its monthly climatology
 * (usual high for this month) with a small note. Units toggle lives in
 * localStorage `mena-weather`.
 */

(function () {
  var CITIES = [
    { key: "karachi", name: "Karachi", lat: 24.8607, lon: 67.0011, tz: "Asia/Karachi" },
    { key: "bucharest", name: "Bucharest", lat: 44.4268, lon: 26.1025, tz: "Europe/Bucharest" }
  ];
  var LS = "mena-weather";
  var REFRESH_MS = 10 * 60 * 1000;
  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Monthly average highs (°C) — rough climatology for the offline fallback.
  var CLIMATE = {
    karachi: [26, 28, 32, 35, 36, 34, 32, 31, 32, 33, 30, 27],
    bucharest: [1, 4, 10, 17, 23, 27, 29, 29, 24, 17, 9, 3]
  };

  var WMO = {
    0: ["☀️", "clear sky"],
    1: ["🌤️", "mostly clear"],
    2: ["⛅", "partly cloudy"],
    3: ["☁️", "overcast"],
    45: ["🌫️", "foggy"],
    48: ["🌫️", "rimy fog"],
    51: ["🌦️", "light drizzle"],
    53: ["🌦️", "drizzle"],
    55: ["🌧️", "heavy drizzle"],
    56: ["🌧️", "freezing drizzle"],
    57: ["🌧️", "freezing drizzle"],
    61: ["🌧️", "light rain"],
    63: ["🌧️", "rain"],
    65: ["🌧️", "heavy rain"],
    66: ["🌧️", "freezing rain"],
    67: ["🌧️", "freezing rain"],
    71: ["🌨️", "light snow"],
    73: ["🌨️", "snow"],
    75: ["❄️", "heavy snow"],
    77: ["❄️", "snow grains"],
    80: ["🌦️", "rain showers"],
    81: ["🌧️", "rain showers"],
    82: ["⛈️", "violent showers"],
    85: ["🌨️", "snow showers"],
    86: ["🌨️", "snow showers"],
    95: ["⛈️", "thunderstorm"],
    96: ["⛈️", "storm with hail"],
    99: ["⛈️", "storm with hail"]
  };

  var state = { unit: "C", data: {}, loading: true, refreshTimer: null };

  function $(id) { return document.getElementById(id); }

  function loadUnit() {
    try {
      var raw = window.localStorage.getItem(LS);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.unit === "F") state.unit = "F";
      }
    } catch (e) { /* default */ }
  }

  function saveUnit() {
    try { window.localStorage.setItem(LS, JSON.stringify({ unit: state.unit })); } catch (e) { /* ignore */ }
  }

  function toUnit(celsius) {
    if (celsius == null || isNaN(celsius)) return null;
    return state.unit === "F" ? celsius * 9 / 5 + 32 : celsius;
  }

  function fmtTemp(celsius) {
    var v = toUnit(celsius);
    if (v == null) return "--°";
    return Math.round(v) + "°";
  }

  function wmo(code) {
    return WMO[code] || ["☁️", "cloudy"];
  }

  function apiURL(city) {
    return "https://api.open-meteo.com/v1/forecast?latitude=" + city.lat +
      "&longitude=" + city.lon +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&forecast_days=3&timezone=auto";
  }

  function localTime(tz) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
      }).format(new Date());
    } catch (e) {
      return "--:--";
    }
  }

  function renderCity(city, data, fallback) {
    var key = city.key;
    var current = data.current || {};
    var daily = data.daily || {};

    $("time-" + key).textContent = localTime(city.tz);

    if (fallback) {
      var month = new Date().getMonth();
      var usual = CLIMATE[key][month];
      $("temp-" + key).textContent = fmtTemp(usual);
      $("icon-" + key).textContent = "🌤️";
      $("desc-" + key).textContent = "usually about this in " + city.name;
      $("extra-" + key).textContent = "live sky unreachable — showing the usual";
      $("forecast-" + key).textContent = "";
      var note = document.createElement("p");
      note.className = "fallback-note";
      note.textContent = "offline — climatology only";
      $("forecast-" + key).appendChild(note);
      return null; // never feed climatology into the "right now" diff
    }

    var code = current.weather_code;
    var pair = wmo(code);
    $("icon-" + key).textContent = pair[0];
    $("desc-" + key).textContent = pair[1];
    $("temp-" + key).textContent = fmtTemp(current.temperature_2m);
    $("extra-" + key).textContent =
      "feels like " + fmtTemp(current.apparent_temperature) +
      " · wind " + Math.round(current.wind_speed_10m) + " km/h";

    var strip = $("forecast-" + key);
    strip.textContent = "";
    var dates = daily.time || [];
    for (var i = 0; i < dates.length; i += 1) {
      var day = document.createElement("div");
      day.className = "day";
      var name = document.createElement("span");
      name.className = "day-name";
      var d = new Date(dates[i] + "T12:00:00Z");
      name.textContent = DAY_NAMES[d.getUTCDay()];
      var icon = document.createElement("span");
      icon.className = "day-icon";
      icon.textContent = wmo(daily.weather_code[i])[0];
      var temp = document.createElement("span");
      temp.className = "day-temp";
      temp.textContent = fmtTemp(daily.temperature_2m_min[i]) + "/" + fmtTemp(daily.temperature_2m_max[i]);
      day.appendChild(name);
      day.appendChild(icon);
      day.appendChild(temp);
      strip.appendChild(day);
    }
    return current.temperature_2m;
  }

  function renderDiff(karachiC, bucharestC) {
    var line = $("diff-line");
    if (karachiC == null || bucharestC == null ||
        isNaN(karachiC) || isNaN(bucharestC)) {
      line.textContent = "\u00a0";
      return;
    }
    var diff = karachiC - bucharestC;
    var abs = Math.abs(diff);
    if (abs < 1) {
      line.textContent = "Right now you're the same temperature. Exactly the same sky ♥";
    } else {
      var warmer = diff > 0 ? "Karachi" : "Bucharest";
      var delta = state.unit === "F" ? abs * 9 / 5 : abs;
      line.textContent = "Right now " + warmer + " is " +
        Math.round(delta) + "° " + state.unit + " warmer — still under one sky ♥";
    }
  }

  function renderNote(text) {
    $("load-note").textContent = text || "\u00a0";
  }

  function loadCity(city) {
    return fetch(apiURL(city))
      .then(function (res) {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then(function (data) {
        state.data[city.key] = { data: data, fallback: false };
        return renderCity(city, data, false);
      })
      .catch(function () {
        state.data[city.key] = { data: {}, fallback: true };
        return renderCity(city, {}, true);
      });
  }

  function refresh() {
    renderNote("looking out both windows…");
    return Promise.all(CITIES.map(loadCity)).then(function (temps) {
      renderDiff(temps[0], temps[1]);
      renderNote("refreshes itself every ten minutes ♥");
    });
  }

  function toggleUnit() {
    state.unit = state.unit === "C" ? "F" : "C";
    saveUnit();
    $("unit-toggle").textContent = "°" + state.unit;
    CITIES.forEach(function (city) {
      var saved = state.data[city.key];
      if (saved) renderCity(city, saved.data, saved.fallback);
    });
    var k = state.data.karachi;
    var b = state.data.bucharest;
    if (k && b) {
      renderDiff(
        k.fallback ? null : k.data.current.temperature_2m,
        b.fallback ? null : b.data.current.temperature_2m
      );
    }
  }

  function boot() {
    loadUnit();
    $("unit-toggle").textContent = "°" + state.unit;
    $("unit-toggle").addEventListener("click", toggleUnit);
    CITIES.forEach(function (city) {
      var card = $("card-" + city.key);
      if (card) card.addEventListener("click", refresh);
    });
    state.refreshTimer = setInterval(refresh, REFRESH_MS);
    refresh();

    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      try { navigator.serviceWorker.register("sw.js"); } catch (e) { /* ignore */ }
    }
  }

  boot();
})();
