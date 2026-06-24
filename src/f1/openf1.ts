const OPENF1_BASE = "https://api.openf1.org/v1";

export type OpenF1Weather = {
  air_temperature: number;
  track_temperature: number;
  wind_speed: number;
  wind_direction: number;
  humidity: number;
  rainfall: number;
  date: string;
};

export type WeatherForEmbed = {
  air_temperature: number;
  track_temperature: number;
  wind_speed: number;
  humidity: number;
  rainfall: number;
};

export async function fetchWeather(meetingKey: number): Promise<WeatherForEmbed | null> {
  try {
    const res = await fetch(`${OPENF1_BASE}/weather?meeting_key=${meetingKey}`);
    if (!res.ok) return null;
    const data = (await res.json()) as OpenF1Weather[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const latest = data.reduce((a, b) => (a.date > b.date ? a : b));
    return {
      air_temperature: latest.air_temperature,
      track_temperature: latest.track_temperature,
      wind_speed: latest.wind_speed,
      humidity: latest.humidity,
      rainfall: latest.rainfall,
    };
  } catch {
    return null;
  }
}
