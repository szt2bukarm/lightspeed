'use client';

import { useRef, useCallback, useEffect, useState } from "react";
import Map from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { data } from "../data";
import Wave from "./Wave";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

// Longitudes every 30 degrees, repeated across wraps for infinite panning
const MERIDIANS = [-720, -360, 0, 360, 720].flatMap((offset) =>
  [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => lng + offset)
);

// Wraps for the solar wave
const WAVE_OFFSETS = [-720, -360, 0, 360, 720];

// Latitude bounds [south, north] to cut off extreme north and south while keeping X-axis infinite
const LAT_RANGE: [number, number] = [-60, 75];

// Calculate real-time subsolar longitude (solar noon position)
const getSolarNoonLongitude = (date: Date = new Date()) => {
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;
  let lng = -(utcHours - 12) * 15;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return lng;
};

interface MapComponentProps {
  targetLocation?: { longitude: number; latitude: number; key: number } | null;
  selectedLocation?: string | null;
  setSelectedLocation?: (location: string | null) => void;
  onResetZoom?: (resetFn: () => void) => void;
}

export default function MapComponent({ targetLocation, setSelectedLocation, selectedLocation, onResetZoom }: MapComponentProps = {}) {
  const mapRef = useRef<MapRef | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const pinRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isLockedRef = useRef(false);
  const baseZoomRef = useRef<number | null>(null);

  const getBaseZoom = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return baseZoomRef.current ?? 0;
    try {
      const helper = (map as any).transform?._helper;
      if (helper?.applyConstrain) {
        const constrained = helper.applyConstrain(map.getCenter(), 0);
        if (typeof constrained?.zoom === "number") {
          baseZoomRef.current = constrained.zoom;
          return constrained.zoom;
        }
      }
    } catch {}
    return baseZoomRef.current ?? 0;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow trackpad pinch-to-zoom (macOS sends ctrlKey: true on pinch)
      if (e.ctrlKey) return;

      const map = mapRef.current?.getMap();
      if (!map) return;

      // Prevent macOS back/forward gesture navigation and stop MapLibre from zooming
      e.preventDefault();
      e.stopPropagation();

      map.panBy([e.deltaX, e.deltaY], {
        duration: 0,
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      container.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!targetLocation) return;
    isLockedRef.current = true;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const currentLng = map.getCenter().lng;
    const targetLng = targetLocation.longitude + Math.round((currentLng - targetLocation.longitude) / 360) * 360;

    map.flyTo({
      center: [targetLng, targetLocation.latitude],
      zoom: 3.5,
      duration: 1000,
      offset: [0, -100],
      essential: true,
    });
  }, [targetLocation]);

  useEffect(() => {
    if (!selectedLocation) {
      isLockedRef.current = false;
    }
  }, [selectedLocation]);

  const handleMapClick = useCallback(
    (e: any) => {
      const target = (e?.originalEvent?.target || e?.target) as HTMLElement | null;
      if (target?.closest?.(".marker-pin")) return;

      if (selectedLocation) {
        isLockedRef.current = false;
        setSelectedLocation?.(null);
      }
    },
    [selectedLocation, setSelectedLocation]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
  }, []);

  const updateOverlay = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // 1. Update pins positions
    const centerLng = map.getCenter().lng;
    data.forEach((item) => {
      const el = pinRefs.current[item.location];
      if (!el) return;
      const lng = item.longitude + Math.round((centerLng - item.longitude) / 360) * 360;
      const pos = map.project([lng, item.latitude]);
      el.style.transform = `translate3d(${pos.x - 6}px, ${pos.y - 6}px, 0)`;
    });

    // 2. Draw 30-degree meridian lines on overlay canvas (separated from blend mode)
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const ctx = canvas.getContext("2d");
      if (ctx && width > 0 && height > 0) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = "rgba(25, 25, 23, 0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        MERIDIANS.forEach((lng) => {
          const top = map.project([lng, 85.051129]);
          const bottom = map.project([lng, -85.051129]);
          if (top.x >= -50 && top.x <= width + 50) {
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bottom.x, bottom.y);
          }
        });
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Update solar daylight Wave positions and scale
    const solarLng = getSolarNoonLongitude();
    const worldWidth =
      (map as any).transform?.worldSize ?? 512 * Math.pow(2, map.getZoom());
    const pCenter = map.project([solarLng, 0]);
    const top = pCenter.y - worldWidth / 2;
    const width = worldWidth;
    const height = worldWidth;

    WAVE_OFFSETS.forEach((offset, idx) => {
      const el = waveRefs.current[idx];
      if (!el) return;

      const left = pCenter.x - worldWidth / 2 + (offset / 360) * worldWidth;

      if (left + width < -200 || left > window.innerWidth + 200) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
        el.style.width = `${width + 1}px`;
        el.style.height = `${height}px`;
        el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      }
    });
  }, []);

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const transform = (map as any).transform;
    if (transform?._helper) {
      transform._helper._latRange = LAT_RANGE;
      transform._helper.constrainInternal?.();
      map.jumpTo({ center: transform.center, zoom: transform.zoom });
    }

    const style = map.getStyle();
    if (style?.layers) {
      style.layers.forEach((layer: any) => {
        if (layer.id === "background") {
          map.setPaintProperty("background", "background-color", "#3F3F3F");
          map.setLayoutProperty("background", "visibility", "visible");
        } else if (layer.id === "water") {
          map.setPaintProperty("water", "fill-color", "#000000");
          map.setLayoutProperty("water", "visibility", "visible");
        } else {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      });
    }

    setMapLoaded(true);
    resizeCanvas();
    updateOverlay();
    baseZoomRef.current = map.getZoom();
  }, [updateOverlay, resizeCanvas]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;

    const handleZoom = () => {
      const baseZoom = getBaseZoom();
      const currentZoom = map.getZoom();
      setIsZoomed(currentZoom - baseZoom > 0.3);
    };

    const handleResize = () => {
      resizeCanvas();
      updateOverlay();
      handleZoom();
    };

    map.on("move", updateOverlay);
    map.on("resize", handleResize);
    map.on("zoom", handleZoom);
    map.on("zoomend", handleZoom);
    window.addEventListener("resize", handleResize);

    handleZoom();

    return () => {
      map.off("move", updateOverlay);
      map.off("resize", handleResize);
      map.off("zoom", handleZoom);
      map.off("zoomend", handleZoom);
      window.removeEventListener("resize", handleResize);
    };
  }, [mapLoaded, updateOverlay, getBaseZoom, resizeCanvas]);

  // Keep wave positions updated as real-world time progresses
  useEffect(() => {
    const timer = setInterval(() => {
      updateOverlay();
    }, 10000);
    return () => clearInterval(timer);
  }, [updateOverlay]);

  useGSAP(() => {
    if (!selectedLocation) return;
    gsap.fromTo(
      '[data-gsap="marker"]',
      { autoAlpha: 0, y: 4 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.25,
        stagger: 0.04,
        ease: "power2.out",
      }
    );
  }, [selectedLocation]);

  const resetZoom = useCallback(() => {
    isLockedRef.current = false;
    mapRef?.current?.flyTo({ center: [0, 20], zoom: 0 });
    setSelectedLocation?.(null);
  }, [setSelectedLocation]);

  useEffect(() => {
    onResetZoom?.(resetZoom);
  }, [resetZoom, onResetZoom]);

  return (
    <div
      ref={containerRef}
      data-gsap="map"
      className="relative w-screen h-[100dvh] opacity-0 group/map"
      onClick={handleMapClick}
    >
      <div className={`absolute top-[30px] right-[30px] w-[158px] h-[54px] backdrop-blur-xs z-[49] rounded-[50px] transition-opacity duration-300 ${isZoomed ? "opacity-100" : "opacity-0 pointer-events-none"}`}/>
      <button
        className={`absolute top-[30px] right-[30px] font-monument-bold px-[20px] py-[5px] bg-[#61616160] text-[#8f8f8f] rounded-[50px] border-[2px] text-[16px] border-[#61616133] z-50 mix-blend-difference hover:brightness-75 cursor-pointer transition-[opacity,filter] duration-300 ${
          isZoomed ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={resetZoom}
      >
        Reset View
      </button>
      {/* gradient overlay */}
      <div data-gsap="map-gradient" className="absolute inset-0 bg-linear-to-b from-[#92B6E6] to-[#ECEAE9] z-0 pointer-events-none" />

      {/* map layer */}
      <div className="absolute inset-0 z-10 mix-blend-difference transition-opacity duration-300">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={{
            longitude: 0,
            latitude: 20,
            zoom: 0
          }}
          maxZoom={3.5}
          dragRotate={false}
          renderWorldCopies={true}
          mapStyle="https://tiles.openfreemap.org/styles/positron"
          attributionControl={false}
          onLoad={onMapLoad}
          onClick={handleMapClick}
          style={{ width: "100%", height: "100%", opacity: selectedLocation ? "50%" : "100%", transition: "opacity 300ms" }}
        />
      </div>

      {/* overlay over the blending mode gradient */}
      <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
        {/* daytime / nighttime wave */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          selectedLocation ? "opacity-40" : "opacity-100"
        }`}>
          {WAVE_OFFSETS.map((offset, idx) => (
            <div
              key={offset}
              ref={(el) => {
                waveRefs.current[idx] = el;
              }}
              className="absolute top-0 left-0 pointer-events-none"
              style={{ display: "none" }}
            >
              <Wave />
            </div>
          ))}
        </div>

        {/* 30-degree lines */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300"
        />

        {/* location pins */}
        {data.map((item) => {
          const isSelected = selectedLocation === item.location;
          return (
            <div
              key={item.location}
              ref={(el) => {
                pinRefs.current[item.location] = el;
              }}
              data-gsap="pins"
              className={`absolute top-0 left-0 cursor-pointer ${isSelected ? "z-30" : "z-10"}`}
              style={{
                willChange: "transform",
              }}
            >
              <div
                onMouseEnter={() => {
                  if (!isLockedRef.current) {
                    setSelectedLocation?.(item.location);
                  }
                }}
                onMouseLeave={() => {
                  if (!isLockedRef.current) {
                    setSelectedLocation?.(null);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if ((e.target as HTMLElement).closest("a")) return;
                  const next = isSelected ? null : item.location;
                  isLockedRef.current = !!next;
                  setSelectedLocation?.(next);
                }}
                className={`marker-pin group flex items-start select-none pointer-events-auto transition-opacity duration-300 cursor-pointer ${
                  selectedLocation === item.location ? "opacity-100" : "opacity-10"
                } ${!selectedLocation && "opacity-100!"}`}
              >
                <div className="w-[12px] h-[12px] rounded-full bg-[#FDA153] shadow-[0px_2px_4.5px_rgba(0,0,0,0.25)] shrink-0 cursor-pointer" />
                <div className="flex flex-col leading-tight -mt-1 ml-0.5">
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      resetZoom();
                    }}
                    className="font-bold text-[#191917] cursor-pointer font-monument-bold text-[16px]"
                  >
                    {item.location}
                  </span>
                  {isSelected &&
                    item.companies.map((company, idx) => (
                        <div data-gsap='marker' key={idx}>
                      <a
                        href={company.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className=" text-[#191917] font-monument-regular hover:opacity-50 duration-150 text-[16px] block"
                      >
                        {company.name}
                      </a>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
