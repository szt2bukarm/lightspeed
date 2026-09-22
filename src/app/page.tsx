'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Clock from "@/components/Clock";
import { data } from "@/data";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import LightspeedText from "@/components/LightspeedText";
import { Swiper, SwiperSlide } from "swiper/react";
import { Mousewheel } from "swiper/modules";

import "swiper/css";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
});

const Logo = dynamic(() => import("@/components/Logo"), {
  ssr: false,
});

export default function App() {
  const [targetLocation, setTargetLocation] = useState<{
    longitude: number;
    latitude: number;
    key: number;
  } | null>(null);
  const [isSwipable, setIsSwipable] = useState(false);
  const [swiper, setSwiper] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const resetZoomRef = useRef<(() => void) | null>(null);

  const handleResetZoom = useCallback(() => {
    resetZoomRef.current?.();
  }, []);

  useEffect(() => {
    if (!isSwipable && swiper) {
      swiper.slideTo(0);
    }
  }, [isSwipable, swiper]);

  useGSAP(() => {
    if (!isReady) return;

    // 1. reveal map
    gsap.to("[data-gsap='map']", {
      opacity: 1,
      duration: 1.2,
      delay: 1.8,
      ease: "power2.inOut",
    });

    // 2. saturate map gradient overlay
    gsap.fromTo(
      "[data-gsap='map-gradient']",
      { filter: "grayscale(100%)" },
      {
        filter: "grayscale(0%)",
        duration: 1.5,
        delay: 2.2,
        ease: "power2.inOut",
      }
    );

    // 3. stagger clock widgets
    gsap.fromTo(
      "[data-gsap='clock']",
      { x: 50, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.04,
        delay: 2.8,
        ease: "power2.out",
      }
    );

    // 4. reveal logo text and bottom gradient + allow mouse events
    gsap.to("[data-gsap='text-logo'],[data-gsap='bottom-radial']", {
      opacity: 1,
      duration: 0.8,
      delay: 3,
      ease: "power2.out",
      onComplete: () => {
        const mainEl = document.querySelector("[data-gsap='main']");
        if (mainEl) {
          mainEl.classList.remove("pointer-events-none");
          mainEl.classList.remove("select-none");
        }
      },
    });

    // 5. reveal pins
    gsap.fromTo(
      "[data-gsap='pins']",
      { opacity: 0 },
      { opacity: 1, duration: 0.8, delay: 3, stagger: 0.1, ease: "power2.out" }
    );
  }, [isReady]);

  return (
    <div data-gsap="main" className="w-screen h-[100dvh] relative overflow-hidden pointer-events-none select-none">
      <div
        data-gsap="bottom-radial"
        className="opacity-0 absolute bottom-0 left-0 w-screen h-[30vh] pointer-events-none z-20"
        style={{
          background:
            "radial-gradient(82.65% 75.17% at 50% 100%, #ECEAE9 0%, rgba(164, 182, 208, 0.6) 40%, rgba(109, 143, 190, 0.3) 70%, rgba(55, 104, 171, 0) 100%)",
        }}
      />
      <MapComponent
        targetLocation={targetLocation}
        selectedLocation={selectedLocation}
        setSelectedLocation={setSelectedLocation}
        onResetZoom={(fn) => {
          resetZoomRef.current = fn;
        }}
      />

      <Logo isReady={isReady} onReady={() => setIsReady(true)} />
      <LightspeedText className="opacity-0 absolute bottom-[36px] left-[16px] sm:bottom-[60px] sm:left-[44px] scale-[0.62] sm:scale-100 origin-left z-30" />
      <div
        className={`absolute bottom-[35px] left-[100px] sm:bottom-[40px] sm:left-[180px] right-0 z-50 overflow-hidden py-2 select-none ${
          isSwipable ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0px, black 12px, black calc(100% - 12px)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0px, black 12px, black calc(100% - 12px)",
        }}
      >
        <Swiper
          onSwiper={setSwiper}
          slidesPerView="auto"
          spaceBetween={10}
          grabCursor={isSwipable}
          watchOverflow={true}
          speed={400}
          onInit={(swiper) => setIsSwipable(!swiper.isLocked)}
          onAfterInit={(swiper) => setIsSwipable(!swiper.isLocked)}
          onUpdate={(swiper) => setIsSwipable(!swiper.isLocked)}
          onResize={(swiper) => setIsSwipable(!swiper.isLocked)}
          onLock={() => setIsSwipable(false)}
          onUnlock={() => setIsSwipable(true)}
          mousewheel={{
            forceToAxis: true,
          }}
          slidesOffsetBefore={10}
          slidesOffsetAfter={10}
          modules={[Mousewheel]}
          className={`w-full !overflow-visible ${
            isSwipable ? "cursor-grab active:cursor-grabbing" : ""
          }`}
        >
          {data.map((item) => (
            <SwiperSlide key={item.location} className="!w-[117px] shrink-0">
              <Clock
                location={item.location}
                timezone={item.timezone}
                isSwipable={isSwipable}
                selectedLocation={selectedLocation}
                resetZoom={handleResetZoom}
                onClick={() => {
                  setSelectedLocation(item.location);
                  setTargetLocation({
                    longitude: item.longitude,
                    latitude: item.latitude,
                    key: Date.now(),
                  });
                }}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}
