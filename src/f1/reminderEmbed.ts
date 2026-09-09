import { EmbedBuilder } from "discord.js";
import type { F1Race } from "./scheduleService.js";
import type { WeatherForEmbed } from "./openf1.js";
import { formatInTimezone } from "../stats/helpers.js";

const FALLBACK_IMAGE_URL = process.env.F1_REMINDER_IMAGE_URL || "";
const DEFAULT_TZ = "UTC";
const F1_EMBED_COLOR = 0xe10600;

const COUNTRY_TO_ISO: Record<string, string> = {
  Australia: "AU",
  Austria: "AT",
  Azerbaijan: "AZ",
  Bahrain: "BH",
  Belgium: "BE",
  Brazil: "BR",
  Canada: "CA",
  China: "CN",
  Hungary: "HU",
  Italy: "IT",
  Japan: "JP",
  Mexico: "MX",
  Monaco: "MC",
  Netherlands: "NL",
  Qatar: "QA",
  "Saudi Arabia": "SA",
  Singapore: "SG",
  Spain: "ES",
  UAE: "AE",
  "United Arab Emirates": "AE",
  UK: "GB",
  "United Kingdom": "GB",
  USA: "US",
  "United States": "US",
};

function getCountryIso(countryName: string): string | null {
  const iso = COUNTRY_TO_ISO[countryName];
  return iso ? iso.toLowerCase() : null;
}

function daysUntilRace(raceDate: Date): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(raceDate.getFullYear(), raceDate.getMonth(), raceDate.getDate());
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export function buildF1ReminderEmbed(
  race: F1Race,
  serverTimezone?: string,
  weather?: WeatherForEmbed | null
): EmbedBuilder {
  const tz = serverTimezone ?? DEFAULT_TZ;
  const raceStartLabel = tz === DEFAULT_TZ ? "Race start (UTC)" : "Race start (server time)";
  const raceStartValue =
    tz === DEFAULT_TZ
      ? race.raceDate.toISOString().replace(".000Z", "Z")
      : formatInTimezone(race.raceDate, tz);

  const footerText =
    tz === DEFAULT_TZ
      ? "Data via Open F1 API • Times in UTC"
      : `Data via Open F1 API • Times in server timezone (${tz})`;

  const countryIso = getCountryIso(race.country);
  const daysUntil = daysUntilRace(race.raceDate);
  const daysLine =
    daysUntil === 0
      ? "Race day is today!"
      : daysUntil === 1
        ? "Race in 1 day"
        : `Race in ${daysUntil} days`;

  const descriptionParts = ["It's almost race day! Here's the info for the upcoming Grand Prix."];
  if (daysUntil <= 7) descriptionParts.push(daysLine);

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "Round", value: race.round, inline: true },
    { name: "Season", value: race.season, inline: true },
    { name: "Location", value: race.country, inline: true },
    { name: "Circuit", value: `${race.circuitName} — ${race.locality}, ${race.country}`, inline: false },
    { name: raceStartLabel, value: raceStartValue, inline: false },
  ];

  if (weather) {
    const windKmh = (weather.wind_speed * 3.6).toFixed(1);
    const rain = weather.rainfall ? "Yes" : "No";
    fields.push({
      name: "Track weather",
      value: `Air ${weather.air_temperature}°C, Track ${weather.track_temperature}°C, Wind ${windKmh} km/h, Rain: ${rain}`,
      inline: false,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(F1_EMBED_COLOR)
    .setTitle(`Upcoming F1 weekend: ${race.name}`)
    .setDescription(descriptionParts.join("\n\n"))
    .addFields(fields)
    .setFooter({ text: footerText })
    .setTimestamp(new Date());

  if (countryIso) {
    embed.setThumbnail(`https://flagcdn.com/w160/${countryIso}.png`);
  }

  if (FALLBACK_IMAGE_URL) {
    embed.setImage(FALLBACK_IMAGE_URL);
  }

  return embed;
}
