const HISTORY_KEY = 'syifa-weather-history';
let currentUnit = 'c';
let lastWeatherData = null;

const appBody = document.getElementById('appBody');
const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const locateBtn = document.getElementById('locateBtn');
const suggestionsBox = document.getElementById('suggestions');
const statusMsg = document.getElementById('statusMsg');
const weatherView = document.getElementById('weatherView');
const unitToggleBtns = document.querySelectorAll('.toggle-btn');

const locationName = document.getElementById('locationName');
const currentIcon = document.getElementById('currentIcon');
const currentTemp = document.getElementById('currentTemp');
const currentDesc = document.getElementById('currentDesc');
const feelsLike = document.getElementById('feelsLike');
const humidityEl = document.getElementById('humidity');
const windEl = document.getElementById('wind');
const uvIndexEl = document.getElementById('uvIndex');
const rainChanceEl = document.getElementById('rainChance');
const pressureEl = document.getElementById('pressure');
const sunTimesEl = document.getElementById('sunTimes');
const hourlyList = document.getElementById('hourlyList');
const forecastList = document.getElementById('forecastList');
const historyChips = document.getElementById('historyChips');
const clearHistoryBtn = document.getElementById('clearHistory');

/* ===== WMO weather code mapping ===== */
function weatherInfo(code, isDay){
  const map = {
    0: ['Cerah', isDay ? '\u2600\ufe0f' : '\ud83c\udf19', 'clear'],
    1: ['Cerah Berawan', isDay ? '\ud83c\udf24\ufe0f' : '\ud83c\udf19', 'clear'],
    2: ['Berawan Sebagian', '\u26c5', 'cloudy'],
    3: ['Berawan', '\u2601\ufe0f', 'cloudy'],
    45: ['Berkabut', '\ud83c\udf2b\ufe0f', 'cloudy'],
    48: ['Kabut Es', '\ud83c\udf2b\ufe0f', 'cloudy'],
    51: ['Gerimis Ringan', '\ud83c\udf26\ufe0f', 'rain'],
    53: ['Gerimis', '\ud83c\udf26\ufe0f', 'rain'],
    55: ['Gerimis Lebat', '\ud83c\udf27\ufe0f', 'rain'],
    61: ['Hujan Ringan', '\ud83c\udf27\ufe0f', 'rain'],
    63: ['Hujan', '\ud83c\udf27\ufe0f', 'rain'],
    65: ['Hujan Lebat', '\u26c8\ufe0f', 'rain'],
    71: ['Salju Ringan', '\ud83c\udf28\ufe0f', 'snow'],
    73: ['Salju', '\ud83c\udf28\ufe0f', 'snow'],
    75: ['Salju Lebat', '\u2744\ufe0f', 'snow'],
    80: ['Hujan Sebentar', '\ud83c\udf26\ufe0f', 'rain'],
    81: ['Hujan Sebentar Lebat', '\ud83c\udf27\ufe0f', 'rain'],
    82: ['Hujan Deras', '\u26c8\ufe0f', 'rain'],
    95: ['Badai Petir', '\u26c8\ufe0f', 'storm'],
    96: ['Badai Petir + Es', '\u26c8\ufe0f', 'storm'],
    99: ['Badai Petir Hebat', '\u26c8\ufe0f', 'storm']
  };
  return map[code] || ['Tidak diketahui', '\u2753', 'cloudy'];
}

function windDirectionLabel(deg){
  const dirs = ['Utara','Timur Laut','Timur','Tenggara','Selatan','Barat Daya','Barat','Barat Laut'];
  return dirs[Math.round(deg / 45) % 8];
}

function cToF(c){ return c * 9/5 + 32; }
function formatTemp(celsius){
  const val = currentUnit === 'c' ? celsius : cToF(celsius);
  return Math.round(val) + '\u00b0' + currentUnit.toUpperCase();
}
function formatTime(iso){
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/* ===== History ===== */
function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch(e){ return []; }
}
function saveHistory(list){ localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }

function addHistory(place){
  let list = loadHistory().filter(p => p.name !== place.name);
  list.unshift(place);
  saveHistory(list.slice(0, 6));
  renderHistory();
}

function renderHistory(){
  const list = loadHistory();
  historyChips.innerHTML = '';
  list.forEach(place => {
    const chip = document.createElement('button');
    chip.className = 'history-chip';
    chip.textContent = place.name;
    chip.addEventListener('click', () => loadWeather(place.lat, place.lon, place.name));
    historyChips.appendChild(chip);
  });
}

clearHistoryBtn.addEventListener('click', () => { saveHistory([]); renderHistory(); });

/* ===== Geocoding search ===== */
let searchTimeout = null;
cityInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = cityInput.value.trim();
  if (query.length < 2){ suggestionsBox.classList.add('hidden'); return; }
  searchTimeout = setTimeout(() => fetchSuggestions(query), 350);
});

async function fetchSuggestions(query){
  try{
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=id&format=json`);
    const data = await res.json();
    renderSuggestions(data.results || []);
  }catch(e){
    suggestionsBox.classList.add('hidden');
  }
}

function renderSuggestions(results){
  if (!results.length){ suggestionsBox.classList.add('hidden'); return; }
  suggestionsBox.innerHTML = '';
  results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    const region = [r.admin1, r.country].filter(Boolean).join(', ');
    item.innerHTML = `${r.name}<span>${region}</span>`;
    item.addEventListener('click', () => {
      suggestionsBox.classList.add('hidden');
      cityInput.value = r.name;
      loadWeather(r.latitude, r.longitude, r.name);
    });
    suggestionsBox.appendChild(item);
  });
  suggestionsBox.classList.remove('hidden');
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = cityInput.value.trim();
  if (!query) return;
  suggestionsBox.classList.add('hidden');
  setStatus('Mencari kota...', false);
  try{
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=id&format=json`);
    const data = await res.json();
    if (!data.results || !data.results.length){
      setStatus('Kota tidak ditemukan. Coba nama lain.', true);
      return;
    }
    const r = data.results[0];
    loadWeather(r.latitude, r.longitude, r.name);
  }catch(e){
    setStatus('Gagal mencari kota. Periksa koneksi internet.', true);
  }
});

/* ===== Geolocation ===== */
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation){
    setStatus('Perangkat tidak mendukung lokasi otomatis.', true);
    return;
  }
  setStatus('Mengambil lokasi kamu...', false);
  navigator.geolocation.getCurrentPosition(
    (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, 'Lokasi Saat Ini'),
    () => setStatus('Tidak bisa mengakses lokasi. Izinkan akses lokasi di browser.', true)
  );
});

/* ===== Fetch weather ===== */
function setStatus(text, isError){
  statusMsg.textContent = text;
  statusMsg.classList.remove('hidden');
  statusMsg.classList.toggle('error', !!isError);
  weatherView.classList.add('hidden');
}

async function loadWeather(lat, lon, name){
  setStatus('Memuat data cuaca...', false);
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max` +
      `&forecast_days=7&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    lastWeatherData = data;
    renderWeather(data, name);
    addHistory({ name, lat, lon });
  }catch(e){
    setStatus('Gagal memuat data cuaca. Periksa koneksi internet.', true);
  }
}

function renderWeather(data, name){
  statusMsg.classList.add('hidden');
  weatherView.classList.remove('hidden');

  const cur = data.current;
  const isDay = cur.is_day === 1;
  const [desc, icon, mood] = weatherInfo(cur.weather_code, isDay);

  appBody.className = 'wx-' + mood + (mood === 'clear' ? (isDay ? '-day' : '-night') : '');

  locationName.textContent = name;
  currentIcon.textContent = icon;
  currentTemp.textContent = formatTemp(cur.temperature_2m);
  currentDesc.textContent = desc;
  feelsLike.textContent = 'Terasa seperti ' + formatTemp(cur.apparent_temperature);
  humidityEl.textContent = cur.relative_humidity_2m + '%';
  windEl.textContent = Math.round(cur.wind_speed_10m) + ' km/j ' + windDirectionLabel(cur.wind_direction_10m);
  pressureEl.textContent = Math.round(cur.pressure_msl) + ' hPa';

  const todayUv = data.daily.uv_index_max[0];
  uvIndexEl.textContent = todayUv !== undefined ? todayUv.toFixed(1) : '\u2014';

  const todayRain = data.daily.precipitation_probability_max[0];
  rainChanceEl.textContent = todayRain !== undefined ? todayRain + '%' : '\u2014';

  sunTimesEl.innerHTML = `\u2600\ufe0f ${formatTime(data.daily.sunrise[0])}<br>\ud83c\udf19 ${formatTime(data.daily.sunset[0])}`;

  /* Hourly: next 24 hours from now */
  hourlyList.innerHTML = '';
  const nowISO = new Date().toISOString().slice(0, 13);
  let startIdx = data.hourly.time.findIndex(t => t.slice(0, 13) >= nowISO);
  if (startIdx < 0) startIdx = 0;
  for (let i = startIdx; i < Math.min(startIdx + 24, data.hourly.time.length); i += 3){
    const [hDesc, hIcon] = weatherInfo(data.hourly.weather_code[i], true);
    const time = new Date(data.hourly.time[i]).toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' });
    const box = document.createElement('div');
    box.className = 'hourly-item';
    box.innerHTML = `
      <span class="h-time">${time}</span>
      <span class="h-icon">${hIcon}</span>
      <span class="h-temp">${formatTemp(data.hourly.temperature_2m[i])}</span>
      <span class="h-rain">${data.hourly.precipitation_probability[i]}%</span>
    `;
    hourlyList.appendChild(box);
  }

  /* 7-day forecast */
  forecastList.innerHTML = '';
  const days = data.daily.time;
  days.forEach((dateStr, i) => {
    if (i === 0) return;
    const [dDesc, dIcon] = weatherInfo(data.daily.weather_code[i], true);
    const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' });
    const box = document.createElement('div');
    box.className = 'forecast-day';
    box.innerHTML = `
      <span class="f-name">${dayName}</span>
      <span class="f-icon">${dIcon}</span>
      <span class="f-temp">${formatTemp(data.daily.temperature_2m_max[i])} <span class="lo">${formatTemp(data.daily.temperature_2m_min[i])}</span></span>
      <span class="f-rain">\ud83d\udca7 ${data.daily.precipitation_probability_max[i]}%</span>
    `;
    forecastList.appendChild(box);
  });
}

unitToggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    unitToggleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentUnit = btn.dataset.unit;
    if (lastWeatherData) renderWeather(lastWeatherData, locationName.textContent);
  });
});

document.addEventListener('click', (e) => {
  if (!suggestionsBox.contains(e.target) && e.target !== cityInput){
    suggestionsBox.classList.add('hidden');
  }
});

renderHistory();