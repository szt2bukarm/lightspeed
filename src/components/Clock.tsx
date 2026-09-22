'use client';

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { data } from "../data";

interface ClockProps {
  location?: string;
  timezone?: string;
  onClick?: () => void;
  isSwipable?: boolean;
  selectedLocation?: string | null;
  resetZoom?: () => void;
}



const LOCATION_DATA: Record<string, { lat: number; lng: number; timezone: string }> = {};
data.forEach((item) => {
  LOCATION_DATA[item.location] = {
    lat: item.latitude,
    lng: item.longitude,
    timezone: item.timezone,
  };
});

function getSunriseSunset(lat: number, lng: number, date: Date, tz: string) {
  try {
    const startOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1));
    const nowUtc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayOfYear = Math.floor((nowUtc.getTime() - startOfYear.getTime()) / 86400000) + 1;

    // Fractional year in radians
    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + 0.5);

    // Equation of time in minutes
    const eqtime =
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(gamma) -
        0.032077 * Math.sin(gamma) -
        0.014615 * Math.cos(2 * gamma) -
        0.040849 * Math.sin(2 * gamma));

    // Solar declination in radians
    const decl =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

    // Solar zenith: 90.833°
    const zenith = 90.833 * (Math.PI / 180);
    const latRad = lat * (Math.PI / 180);

    const cosHa =
      (Math.cos(zenith) - Math.sin(latRad) * Math.sin(decl)) /
      (Math.cos(latRad) * Math.cos(decl));

    let haDeg = 90;
    if (cosHa >= 1) {
      return { sunrise: "--", sunset: "--", isDaytime: false };
    } else if (cosHa <= -1) {
      return { sunrise: "All day", sunset: "All day", isDaytime: true };
    } else {
      haDeg = Math.acos(cosHa) * (180 / Math.PI);
    }

    const sunriseUtcMinutes = 720 - 4 * (lng + haDeg) - eqtime;
    const sunsetUtcMinutes = 720 - 4 * (lng - haDeg) - eqtime;

    const sunriseDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(sunriseUtcMinutes)));
    const sunsetDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(sunsetUtcMinutes)));

    const formatTime = (d: Date) => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).formatToParts(d);
      const h = parts.find((p) => p.type === "hour")?.value || "";
      const m = parts.find((p) => p.type === "minute")?.value.padStart(2, "0") || "00";
      const p = parts.find((p) => p.type === "dayPeriod")?.value.toUpperCase() || "AM";
      return `${h}:${m} ${p}`;
    };

    const isDaytime = date >= sunriseDate && date < sunsetDate;

    return {
      sunrise: cosHa >= 1 ? "--" : cosHa <= -1 ? "All day" : formatTime(sunriseDate),
      sunset: cosHa >= 1 ? "--" : cosHa <= -1 ? "All day" : formatTime(sunsetDate),
      isDaytime,
    };
  } catch {
    const hour24 = date.getHours();
    return {
      sunrise: "6:00 AM",
      sunset: "7:00 PM",
      isDaytime: hour24 >= 7 && hour24 < 19,
    };
  }
}

const TIME_DIFF_CACHE = new Map<string, { value: string; timestamp: number }>();

function getTimeDifference(tz: string) {
  const nowMs = Date.now();
  const cached = TIME_DIFF_CACHE.get(tz);
  if (cached && nowMs - cached.timestamp < 30000) {
    return cached.value;
  }

  const now = new Date();

  const userYear = now.getFullYear();
  const userMonth = now.getMonth();
  const userDate = now.getDate();
  const userHours = now.getHours();
  const userMinutes = now.getMinutes();

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(now);
    let targetYear = userYear;
    let targetMonth = userMonth + 1;
    let targetDay = userDate;
    let targetHours = userHours;
    let targetMinutes = userMinutes;

    for (const part of parts) {
      if (part.type === "year") targetYear = parseInt(part.value, 10);
      if (part.type === "month") targetMonth = parseInt(part.value, 10);
      if (part.type === "day") targetDay = parseInt(part.value, 10);
      if (part.type === "hour") targetHours = parseInt(part.value, 10);
      if (part.type === "minute") targetMinutes = parseInt(part.value, 10);
    }

    const userUtc = Date.UTC(userYear, userMonth, userDate, userHours, userMinutes);
    const targetUtc = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHours, targetMinutes);

    const diffMinutes = Math.round((targetUtc - userUtc) / (1000 * 60));
    const diffHours = diffMinutes / 60;

    const userMidnight = Date.UTC(userYear, userMonth, userDate);
    const targetMidnight = Date.UTC(targetYear, targetMonth - 1, targetDay);
    const dayDiff = Math.round((targetMidnight - userMidnight) / (1000 * 60 * 60 * 24));

    let dayLabel = "Today";
    if (dayDiff >= 1) {
      dayLabel = "Tomorrow";
    } else if (dayDiff <= -1) {
      dayLabel = "Yesterday";
    }

    let hourStr = "";
    if (diffHours === 0) {
      hourStr = "+0HRS";
    } else {
      const sign = diffHours > 0 ? "+" : "-";
      const absH = Math.abs(diffHours);
      const hFormatted = absH % 1 === 0 ? absH.toString() : absH.toFixed(1);
      const unit = absH === 1 ? "HR" : "HRS";
      hourStr = `${sign}${hFormatted}${unit}`;
    }

    const result = `${dayLabel} ${hourStr}`;
    TIME_DIFF_CACHE.set(tz, { value: result, timestamp: nowMs });
    return result;
  } catch {
    return "Today +0HRS";
  }
}

function getTime(location?: string, timezone?: string) {
  const now = new Date();
  const tz = timezone || (location && LOCATION_DATA[location]?.timezone) || "UTC";
  const coords = (location && LOCATION_DATA[location]) || { lat: 0, lng: 0 };
  const { sunrise, sunset, isDaytime } = getSunriseSunset(coords.lat, coords.lng, now, tz);
  const timeDifference = getTimeDifference(tz);

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: true,
    });

    const parts = formatter.formatToParts(now);
    let hour = 12;
    let minute = 0;
    let second = 0;
    let dayPeriod = "AM";

    for (const part of parts) {
      if (part.type === "hour") hour = parseInt(part.value, 10);
      else if (part.type === "minute") minute = parseInt(part.value, 10);
      else if (part.type === "second") second = parseInt(part.value, 10);
      else if (part.type === "dayPeriod") dayPeriod = part.value.toUpperCase();
    }

    return { hour, minute, second, dayPeriod, isDaytime, sunrise, sunset, timeDifference };
  } catch {
    const hour24 = now.getHours();
    return {
      hour: hour24 % 12 || 12,
      minute: now.getMinutes(),
      second: now.getSeconds(),
      dayPeriod: hour24 >= 12 ? "PM" : "AM",
      isDaytime,
      sunrise,
      sunset,
      timeDifference,
    };
  }
}

const HourHand = ({
  isDaytime,
  ref,
}: {
  isDaytime: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) => {
  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none"
      style={{
        transform: "translate(-2.48px, -22.87px)",
      }}
    >
      <div
        ref={ref}
        style={{
          transformOrigin: "2.48px 22.87px",
          willChange: "transform",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="5" height="26" viewBox="0 0 5 26" fill="none">
          <path
            d="M2.48242 0C3.0552 -2.5037e-08 3.51953 0.46433 3.51953 1.03711V20.6152C4.37306 21.008 4.9667 21.869 4.9668 22.8701C4.9668 24.2415 3.85481 25.3535 2.4834 25.3535C1.11199 25.3535 5.99462e-08 24.2415 0 22.8701C9.6194e-05 21.8697 0.592853 21.0094 1.44531 20.6162V1.03711C1.44531 0.46433 1.90964 2.5037e-08 2.48242 0Z"
            fill={isDaytime ? "white" : "#000000"}
          />
        </svg>
      </div>
    </div>
  );
};

const MinuteHand = ({
  isDaytime,
  ref,
}: {
  isDaytime: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) => {
  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none"
      style={{
        transform: "translate(-2px, -36px)",
      }}
    >
      <div
        ref={ref}
        style={{
          transformOrigin: "2px 36px",
          willChange: "transform",
        }}
      >
        <div
          className={`w-[4px] h-[38px] rounded-[21px] border-[1px] ${
            isDaytime
              ? "bg-white border-[#E1470A]"
              : "bg-[#000000] border-[#C4D9F4]"
          }`}
        />
      </div>
    </div>
  );
};

const SecondHand = ({
  isDaytime,
  ref,
}: {
  isDaytime: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) => {
  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none z-10"
      style={{
        transform: "translate(-1.44px, -34.2px)",
      }}
    >
      <div
        ref={ref}
        style={{
          transformOrigin: "1.44px 34.2px",
          willChange: "transform",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="3" height="40" viewBox="0 0 3 40" fill="none">
          <path
            d="M1.43652 0C1.58107 0 1.69824 0.117175 1.69824 0.261719V32.79C2.36659 32.9131 2.87305 33.4982 2.87305 34.2021C2.87305 34.906 2.3665 35.4901 1.69824 35.6133V38.9805C1.69824 39.125 1.58107 39.2422 1.43652 39.2422C1.29198 39.2422 1.1748 39.125 1.1748 38.9805V35.6133C0.506543 35.4901 0 34.906 0 34.2021C0 33.4982 0.506457 32.9131 1.1748 32.79V0.261719C1.17481 0.117176 1.29198 0 1.43652 0Z"
            fill={isDaytime ? "#FFCA1E" : "#E1470A"}
          />
        </svg>
      </div>
    </div>
  );
};

const RADIUS = 37;
const CLOCK_NUMBERS = Array.from({ length: 12 }, (_, i) => {
  const num = i + 1;
  const angle = (num * 30 - 90) * (Math.PI / 180);
  return {
    num,
    x: Math.round(RADIUS * Math.cos(angle) * 100) / 100,
    y: Math.round(RADIUS * Math.sin(angle) * 100) / 100,
  };
});

const AnalogClock = ({
  location,
  timezone,
  isDaytime,
}: {
  location?: string;
  timezone?: string;
  isDaytime: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      let cachedTime = getTime(location, timezone);
      let lastSecond = -1;

      const update = () => {
        const now = new Date();
        const currentSecond = now.getSeconds();
        if (currentSecond !== lastSecond) {
          lastSecond = currentSecond;
          cachedTime = getTime(location, timezone);
        }

        const sec = currentSecond + now.getMilliseconds() / 1000;
        const min = cachedTime.minute + sec / 60;
        const hr = (cachedTime.hour % 12) + min / 60;

        gsap.set(secondRef.current, {
          rotation: sec * 6,
          transformOrigin: "1.44px 34.2px",
        });
        gsap.set(minuteRef.current, {
          rotation: min * 6,
          transformOrigin: "2px 36px",
        });
        gsap.set(hourRef.current, {
          rotation: hr * 30,
          transformOrigin: "2.48px 22.87px",
        });
      };

      gsap.ticker.add(update);

      return () => {
        gsap.ticker.remove(update);
      };
    },
    { dependencies: [location, timezone], scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-[100px] h-[100px] rounded-full border-[2px] border-transparent overflow-hidden transition-[filter] duration-200 group-hover/clock:brightness-75 hover:brightness-75 ${
        isDaytime
          ? "[background:linear-gradient(#E1470A,#E1470A)_padding-box,linear-gradient(to_bottom,#F67B4B,#AD380A)_border-box]"
          : "[background:linear-gradient(#C4D9F4,#C4D9F4)_padding-box,linear-gradient(to_bottom,#CFDBEB,#84B2ED)_border-box]"
      }`}
    >
      {CLOCK_NUMBERS.map(({ num, x, y }) => (
        <span
          key={num}
          className={`absolute top-1/2 left-[50.5%] flex items-center justify-center w-[14px] h-[14px] text-[12px] font-monument-bold select-none pointer-events-none ${
            isDaytime ? "text-[#D6E4F0]" : "text-[#000000]"
          }`}
          style={{
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
          }}
        >
          {num}
        </span>
      ))}

      {/* clock hands */}
      <MinuteHand ref={minuteRef} isDaytime={isDaytime} />
      <HourHand ref={hourRef} isDaytime={isDaytime} />
      <SecondHand ref={secondRef} isDaytime={isDaytime} />

      {/* center cap */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full z-20 pointer-events-none ${
          isDaytime ? "bg-[#FFCA1E]" : "bg-[#E1470A]"
        }`}
      />
    </div>
  );
};

export default function Clock({
  location = "New York",
  timezone,
  onClick,
  isSwipable,
  selectedLocation,
  resetZoom,
}: ClockProps) {
  const [time, setTime] = useState(() => getTime(location, timezone));

  useEffect(() => {
    setTime(getTime(location, timezone));

    const timer = setInterval(() => {
      setTime(getTime(location, timezone));
    }, 1000);

    return () => clearInterval(timer);
  }, [location, timezone]);

  const formattedMinute = time.minute.toString().padStart(2, "0");

  const handleClick = () => {
    if (selectedLocation === location && resetZoom) {
      resetZoom();
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      data-gsap="clock"
      className={`group/clock opacity-0 w-[117px] flex flex-col items-center pt-[6px] pb-[10px] border-[2px] gap-[10px] border-transparent rounded-[19px] shrink-0 duration-200 transition-[filter] ${
        time.isDaytime
          ? "[background:linear-gradient(to_bottom,#E1470A,#232A29)_padding-box,linear-gradient(to_bottom,#E1470A,#666666)_border-box]"
          : "[background:linear-gradient(to_bottom,#C4D9F4,#232A29)_padding-box,linear-gradient(to_bottom,#C4D9F4,#666666)_border-box]"
      } ${
        isSwipable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${selectedLocation == location ? "brightness-115" : "brightness-100"}`}
    >
      <AnalogClock location={location} timezone={timezone} isDaytime={time.isDaytime} />

      <div className="flex flex-col text-center">
        <p className="font-monument-bold text-[#D6E4F0] text-[11px] leading-[125%]">
          {location}<span className="hidden sm:inline">, </span><br className="block sm:hidden"></br>{time.hour}:{formattedMinute} {time.dayPeriod}
        </p>
        <p className="hidden sm:block font-monument-regular text-[#D6E4F0] opacity-75 text-[11px] leading-[125%]">
          {time.timeDifference}
        </p>
        <p className="hidden sm:block font-monument-regular text-[#D6E4F0] opacity-75 text-[11px] leading-[125%]">
          Sunrise {time.sunrise}
        </p>
        <p className="hidden sm:block font-monument-regular text-[#D6E4F0] opacity-75 text-[11px] leading-[125%]">
          Sunset {time.sunset}
        </p>
      </div>
    </div>
  );
}