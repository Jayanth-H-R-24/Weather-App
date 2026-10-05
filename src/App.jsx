import { useEffect, useMemo, useState } from 'react';
import {
  CloudRain,
  Droplets,
  Gauge,
  MapPinned,
  Navigation,
  Search,
  ShieldAlert,
  SunMedium,
  ThermometerSun,
  Wind,
} from 'lucide-react';
import { Circle, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const weatherCodeMap = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mostly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Cloudy', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Moderate drizzle', icon: '🌦️' },
  55: { label: 'Dense drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌧️' },
  57: { label: 'Heavy freezing drizzle', icon: '🌧️' },
  61: { label: 'Slight rain', icon: '🌦️' },
  63: { label: 'Moderate rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌧️' },
  67: { label: 'Heavy freezing rain', icon: '🌧️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Moderate snow', icon: '❄️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '❄️' },
  80: { label: 'Rain showers', icon: '🌦️' },
  81: { label: 'Heavy rain showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm with hail', icon: '⛈️' },
  99: { label: 'Severe thunderstorm', icon: '⛈️' },
};

const defaultLocation = {
  latitude: 12.9716,
  longitude: 77.5946,
  name: 'Bengaluru',
  region: 'Karnataka',
  country: 'India',
};

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric' });
const formatDate = (value) => new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const formatWindDirection = (deg) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(((deg % 360) / 45)) % 8];
};

async function fetchCityCoordinates(city) {
  const endpoint = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetch(endpoint);
  const data = await response.json();
  if (!data.results || !data.results.length) return null;

  const result = data.results[0];
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: result.name,
    region: result.admin1 || result.country,
    country: result.country,
  };
}

async function fetchWeatherData(latitude, longitude) {
  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code,uv_index&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto&forecast_days=10`;

  const response = await fetch(endpoint);
  const data = await response.json();

  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  const minutely = data.minutely_15 || [];

  return {
    current: {
      ...current,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      dewPoint: current.dew_point_2m,
      pressure: current.pressure_msl,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      uvIndex: current.uv_index,
      weatherCode: current.weather_code,
      precipitation: current.precipitation || 0,
    },
    hourly: hourly.time.map((time, index) => ({
      time,
      temperature: hourly.temperature_2m[index],
      precipitationChance: hourly.precipitation_probability[index],
      precipitation: hourly.precipitation[index] || 0,
      weatherCode: hourly.weather_code[index],
      windSpeed: hourly.wind_speed_10m[index],
      direction: hourly.wind_direction_10m[index],
    })),
    daily: daily.time.map((time, index) => ({
      time,
      weatherCode: daily.weather_code[index],
      tempMax: daily.temperature_2m_max[index],
      tempMin: daily.temperature_2m_min[index],
      sunrise: daily.sunrise[index],
      sunset: daily.sunset[index],
      uvIndex: daily.uv_index_max[index],
      precipitationChance: daily.precipitation_probability_max[index],
    })),
    minuteCast: minutely.slice(0, 8).map((entry) => ({
      time: entry.time,
      precipitation: entry.precipitation || 0,
    })),
  };
}

async function fetchAirQuality(latitude, longitude) {
  const endpoint = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm10,pm2_5,carbon_monoxide,ozone&timezone=auto`;
  const response = await fetch(endpoint);
  const data = await response.json();

  return data.current || {
    us_aqi: 0,
    pm10: 0,
    pm2_5: 0,
    carbon_monoxide: 0,
    ozone: 0,
  };
}

async function fetchWeatherAlerts(latitude, longitude) {
  try {
    const endpoint = `https://api.weather.gov/alerts/active?point=${latitude},${longitude}`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/geo+json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.features || []).slice(0, 3).map((feature) => ({
      id: feature.id,
      title: feature.properties.event || 'Weather Advisory',
      description: feature.properties.headline || 'Regional weather alert active.',
      severity: feature.properties.severity || 'Moderate',
    }));
  } catch (error) {
    return [];
  }
}

function App() {
  const [cityInput, setCityInput] = useState('Bengaluru');
  const [location, setLocation] = useState(defaultLocation);
  const [weather, setWeather] = useState(null);
  const [airQuality, setAirQuality] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('Loading weather data...');

  const loadWeather = async (lat, lon, label) => {
    setStatus('Fetching live conditions...');
    try {
      const [conditions, air, alertData] = await Promise.all([
        fetchWeatherData(lat, lon),
        fetchAirQuality(lat, lon),
        fetchWeatherAlerts(lat, lon),
      ]);

      setWeather(conditions);
      setAirQuality(air);
      setAlerts(alertData);
      if (label) {
        setCityInput(label);
      }
      setStatus('Live conditions updated');
    } catch (error) {
      setStatus('Unable to load condition data right now.');
      console.error(error);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({
            latitude,
            longitude,
            name: 'Your location',
            region: 'Current position',
            country: 'Local',
          });
          loadWeather(latitude, longitude, 'Your location');
        },
        () => {
          loadWeather(defaultLocation.latitude, defaultLocation.longitude, defaultLocation.name);
        }
      );
    } else {
      loadWeather(defaultLocation.latitude, defaultLocation.longitude, defaultLocation.name);
    }
  }, []);

  const handleSearch = async () => {
    const trimmed = cityInput.trim();
    if (!trimmed) return;

    const coordinates = await fetchCityCoordinates(trimmed);
    if (!coordinates) {
      setStatus('No matching city found. Try another location.');
      return;
    }

    setLocation(coordinates);
    loadWeather(coordinates.latitude, coordinates.longitude, coordinates.name);
  };

  const widgetStats = useMemo(() => {
    if (!weather) return [];
    const current = weather.current;
    return [
      { label: 'Temperature', value: `${Math.round(current.temperature)}°C`, icon: <ThermometerSun size={18} /> },
      { label: 'Feels Like', value: `${Math.round(current.feelsLike)}°C`, icon: <SunMedium size={18} /> },
      { label: 'Humidity', value: `${Math.round(current.humidity)}%`, icon: <Droplets size={18} /> },
      { label: 'Wind', value: `${Math.round(current.windSpeed)} km/h`, icon: <Wind size={18} /> },
    ];
  }, [weather]);

  const hourlyTimeline = useMemo(() => {
    if (!weather) return [];
    return weather.hourly.slice(0, 8);
  }, [weather]);

  const currentCondition = weather?.current ? weatherCodeMap[weather.current.weatherCode] || { label: 'Weather', icon: '🌤️' } : { label: 'Loading', icon: '🌤️' };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">☼</div>
          <div>
            <p className="eyebrow">Forecast</p>
            <h1>Weather Pulse</h1>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
            placeholder="Search city or region"
          />
          <button onClick={handleSearch}>
            <Search size={16} />
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero panel">
          <div className="hero-content">
            <div className="status-row">
              <span className="pill">Live</span>
              <span className="status-text">{status}</span>
            </div>

            <div className="location-row">
              <MapPinned size={18} />
              <span>
                {location.name}, {location.region} • {location.country}
              </span>
            </div>

            <div className="current-weather">
              <div className="condition-icon">{currentCondition.icon}</div>
              <div>
                <div className="big-temp">
                  {weather ? `${Math.round(weather.current.temperature)}°` : '--°'}
                </div>
                <div className="condition-title">{currentCondition.label}</div>
              </div>
            </div>

            <div className="hero-meta">
              <div>
                <span>Feels like</span>
                <strong>{weather ? `${Math.round(weather.current.feelsLike)}°C` : '--'}</strong>
              </div>
              <div>
                <span>Humidity</span>
                <strong>{weather ? `${Math.round(weather.current.humidity)}%` : '--'}</strong>
              </div>
              <div>
                <span>Pressure</span>
                <strong>{weather ? `${Math.round(weather.current.pressure)} hPa` : '--'}</strong>
              </div>
            </div>
          </div>

          <div className="radar-box">
            <div className="radar-header">
              <span className="mini-label">Interactive radar</span>
              <span className="pulse-dot" />
            </div>

            <div className="map-wrap">
              <MapContainer center={[location.latitude, location.longitude]} zoom={7} scrollWheelZoom={false} className="weather-map">
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Circle
                  center={[location.latitude, location.longitude]}
                  radius={22000}
                  pathOptions={{ color: '#5eead4', fillColor: '#5eead4', fillOpacity: 0.18 }}
                />
                <Circle
                  center={[location.latitude, location.longitude]}
                  radius={33000}
                  pathOptions={{ color: '#7dd3fc', fillColor: '#7dd3fc', fillOpacity: 0.12 }}
                />
                <Marker position={[location.latitude, location.longitude]}>
                  <Popup>
                    {location.name}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>
        </section>

        <section className="widget-row">
          {widgetStats.map((stat, index) => (
            <div className="widget panel" key={index}>
              <div className="widget-icon">{stat.icon}</div>
              <div>
                <small>{stat.label}</small>
                <strong>{stat.value}</strong>
              </div>
            </div>
          ))}
        </section>

        <section className="content-grid">
          <div className="panel info-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Rain cast</p>
                <h2>Next 120 minutes</h2>
              </div>
              <CloudRain size={18} />
            </div>

            <div className="minute-bars">
              {weather?.minuteCast?.map((item, index) => (
                <div className="bar-wrap" key={index}>
                  <div className="bar" style={{ height: `${Math.min((item.precipitation || 0) * 80, 100)}%` }} />
                  <span>{formatTime(item.time)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel info-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Air quality</p>
                <h2>Health insights</h2>
              </div>
              <ShieldAlert size={18} />
            </div>

            <div className="aqi-block">
              <div className="aqi-number">{airQuality ? Math.round(airQuality.us_aqi) : '--'}</div>
              <div>
                <strong>{airQuality ? (airQuality.us_aqi <= 50 ? 'Good' : airQuality.us_aqi <= 100 ? 'Moderate' : 'Unhealthy') : 'Loading'}</strong>
                <p>Pollen and AQI data support daily health planning.</p>
              </div>
            </div>

            <div className="metric-list">
              <div>
                <span>PM2.5</span>
                <strong>{airQuality ? `${Number(airQuality.pm2_5).toFixed(1)} µg/m³` : '--'}</strong>
              </div>
              <div>
                <span>PM10</span>
                <strong>{airQuality ? `${Number(airQuality.pm10).toFixed(1)} µg/m³` : '--'}</strong>
              </div>
              <div>
                <span>Ozone</span>
                <strong>{airQuality ? `${Number(airQuality.ozone).toFixed(1)} ppb` : '--'}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel timeline-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Hour by hour</p>
              <h2>Hourly outlook</h2>
            </div>
            <Navigation size={18} />
          </div>

          <div className="hourly-row">
            {hourlyTimeline.map((slot, index) => (
              <div className="hour-card" key={index}>
                <span>{formatTime(slot.time)}</span>
                <div className="mini-icon">{weatherCodeMap[slot.weatherCode]?.icon || '🌤️'}</div>
                <strong>{Math.round(slot.temperature)}°</strong>
                <small>{slot.precipitationChance || 0}% rain</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel daily-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Extended forecast</p>
              <h2>10-day outlook</h2>
            </div>
            <Gauge size={18} />
          </div>

          <div className="daily-list">
            {weather?.daily?.map((day, index) => (
              <div className="day-row" key={index}>
                <span>{formatDate(day.time)}</span>
                <div className="day-main">
                  <span className="day-icon">{weatherCodeMap[day.weatherCode]?.icon || '🌤️'}</span>
                  <span>{weatherCodeMap[day.weatherCode]?.label || 'Forecast'}</span>
                </div>
                <strong>{Math.round(day.tempMax)}°</strong>
                <small>{Math.round(day.tempMin)}°</small>
                <em>{day.precipitationChance || 0}%</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel alert-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Safety alerts</p>
              <h2>Severe weather warnings</h2>
            </div>
            <ShieldAlert size={18} />
          </div>

          {alerts.length ? (
            <div className="alert-list">
              {alerts.map((alert) => (
                <div className="alert-item" key={alert.id}>
                  <div className="alert-tag">{alert.severity}</div>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="alert-list empty">
              <div className="alert-item neutral">
                <div className="alert-tag">Clear</div>
                <div>
                  <strong>No active alerts</strong>
                  <p>Current conditions are stable in this area.</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="panel detail-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Conditions</p>
              <h2>Atmospheric details</h2>
            </div>
            <Wind size={18} />
          </div>

          <div className="detail-grid">
            <div>
              <span>Dew point</span>
              <strong>{weather ? `${Math.round(weather.current.dewPoint)}°C` : '--'}</strong>
            </div>
            <div>
              <span>Wind direction</span>
              <strong>{weather ? `${formatWindDirection(weather.current.windDirection)} • ${Math.round(weather.current.windDirection)}°` : '--'}</strong>
            </div>
            <div>
              <span>UV index</span>
              <strong>{weather ? `${Number(weather.current.uvIndex).toFixed(1)}` : '--'}</strong>
            </div>
            <div>
              <span>Sunrise</span>
              <strong>{weather ? formatTime(weather.daily[0].sunrise) : '--'}</strong>
            </div>
            <div>
              <span>Sunset</span>
              <strong>{weather ? formatTime(weather.daily[0].sunset) : '--'}</strong>
            </div>
            <div>
              <span>Rain chance</span>
              <strong>{weather ? `${Math.round(weather.daily[0].precipitationChance)}%` : '--'}</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
