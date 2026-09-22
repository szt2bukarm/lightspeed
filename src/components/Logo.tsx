'use client';

import { memo, Suspense, useEffect, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, Center, PerspectiveCamera, OrthographicCamera } from "@react-three/drei";
import { DoubleSide, DirectionalLight } from "three";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// Position and scale configs for desktop (>= 640px) vs mobile (< 640px)
export const LOGO_DESKTOP_CONFIG = {
  initialScale: 1.0,
  scale: 0.27,
  offsetX: 0.45,
  offsetY: 0.60,
};

export const LOGO_MOBILE_CONFIG = {
  initialScale: 0.7,
  scale: 0.165, 
  offsetX: 0.228,
  offsetY: 0.38,
};

function GlassLogo({
  isReady,
  onReady,
}: {
  isReady: boolean;
  onReady: () => void;
}) {
  const { nodes } = useGLTF("/lightspeed.glb") as any;
  const logoRef = useRef<any>(null);
  const matRef = useRef<any>(null);
  const isMovedRef = useRef(false);
  const animProgressRef = useRef({ progress: 0 });
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const hasTriggeredReady = useRef(false);

  useEffect(() => {
    if (nodes?.Curve?.geometry && !hasTriggeredReady.current) {
      hasTriggeredReady.current = true;
      try {
        gl.compile(scene, camera);
      } catch {
      }
      requestAnimationFrame(() => {
        onReady();
      });
    }
  }, [nodes, onReady, gl, scene, camera]);

  // after intro
  useGSAP(() => {
    if (!isReady || !logoRef.current) return;

    // 1. spin
    gsap.to(logoRef.current.rotation, {
      y: "+=12.56",
      duration: 1.5,
      ease: "power2.inOut",
      delay: 2,
    });

    // 2. scale down + move to corner
    gsap.to(animProgressRef.current, {
      progress: 1,
      duration: 1.5,
      ease: "power4.inOut",
      delay: 2,
      onComplete: () => {
        isMovedRef.current = true;
      },
    });

    // 3. env intensitiy 0->1
    const envObj = { intensity: 0 };
    scene.environmentIntensity = 0;
    gsap.to(envObj, {
      intensity: 1,
      duration: 1.5,
      ease: "power4.inOut",
      delay: 2,
      onUpdate: () => {
        scene.environmentIntensity = envObj.intensity;
      },
    });

    // 4. change mesh to black
    if (matRef.current) {
      matRef.current.color.set("#E85A0B");
      gsap.to(matRef.current.color, {
        r: 0,
        g: 0,
        b: 0,
        duration: 1.5,
        ease: "power4.inOut",
        delay: 2,
      });
    }

    // continuous spinning after intro
    gsap.to(logoRef.current.rotation, {
      y: "+=6.283185",
      duration: 5,
      repeat: -1,
      ease: "linear",
      delay: 5,
    });
  }, [isReady]);

  // check for resize and update
  useFrame(({ viewport: v, size }) => {
    if (!logoRef.current) return;

    const isMobile = size.width < 640;
    const target = isMobile ? LOGO_MOBILE_CONFIG : LOGO_DESKTOP_CONFIG;

    if (isMovedRef.current) {
      logoRef.current.position.x = -v.width / 2 + target.offsetX;
      logoRef.current.position.y = -v.height / 2 + target.offsetY;
      logoRef.current.scale.set(target.scale, target.scale, target.scale);
      if (matRef.current) {
        matRef.current.color.set("#000000");
      }
      scene.environmentIntensity = 1;
    } else if (animProgressRef.current.progress > 0) {
      const p = animProgressRef.current.progress;
      logoRef.current.position.x = (-v.width / 2 + target.offsetX) * p;
      logoRef.current.position.y = (-v.height / 2 + target.offsetY) * p;
      const s = target.initialScale + (target.scale - target.initialScale) * p;
      logoRef.current.scale.set(s, s, s);
    } else {
      logoRef.current.scale.set(target.initialScale, target.initialScale, target.initialScale);
      logoRef.current.position.set(0, 0, 0);
    }
  });

  if (!nodes?.Curve?.geometry) return null;

  return (
    <group ref={logoRef} visible={isReady}>
      <Center>
        <mesh
          geometry={nodes.Curve.geometry}
          scale={50}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshPhysicalMaterial
            ref={matRef}
            color="#E85A0B"
            specularColor="#000000"
            transparent
            opacity={0.75}
            roughness={0.25}
            metalness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.15}
            ior={1.52}
            reflectivity={0.9}
            envMapIntensity={1}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </Center>
    </group>
  );
}

function Scene({
  isReady,
  onReady,
  onLightRevealed,
}: {
  isReady: boolean;
  onReady: () => void;
  onLightRevealed?: () => void;
}) {
  const set = useThree((state) => state.set);
  const scene = useThree((state) => state.scene);
  const lightRef = useRef<DirectionalLight>(null);
  const perspCamRef = useRef<any>(null);
  const orthoCamRef = useRef<any>(null);
  const isOrthoRef = useRef(false);

  const callbacksRef = useRef({ onLightRevealed });
  callbacksRef.current = { onLightRevealed };

  // fixed 233 zoom for ortho camera on all screen sizes
  const getMatchingPerspFOV = (height: number) => {
    const tanHalfFov = height / (2 * 5 * 233);
    return 2 * Math.atan(tanHalfFov) * (180 / Math.PI);
  };

  const initialPerspFOV = useRef(
    typeof window !== "undefined" ? getMatchingPerspFOV(window.innerHeight) : 45
  ).current;

  useFrame(({ size: currentSize, camera }) => {
    if (isOrthoRef.current && orthoCamRef.current && camera !== orthoCamRef.current) {
      orthoCamRef.current.zoom = 233;
      orthoCamRef.current.updateProjectionMatrix();
      set(() => ({ camera: orthoCamRef.current }));
    } else if (!isOrthoRef.current && perspCamRef.current) {
      const targetFov = getMatchingPerspFOV(currentSize.height);
      if (Math.abs(perspCamRef.current.fov - targetFov) > 0.05) {
        perspCamRef.current.fov = targetFov;
        perspCamRef.current.updateProjectionMatrix();
      }
    }
  });

  useEffect(() => {
    scene.environmentIntensity = 0;
  }, [scene]);

  useEffect(() => {
    if (!lightRef.current) return;

    // intro setup: start completely dark
    lightRef.current.position.set(-0.05, 0, -3);
    lightRef.current.intensity = 0;

    if (!isReady) return;

    const tl = gsap.timeline();

    // 1. light intensity 0->50
    tl.to(lightRef.current, {
      intensity: 50,
      duration: 1,
      ease: "power2.inOut",
    });

    // light movement to light up the rim of the logo
    tl.to(
      lightRef.current.position,
      {
        x: 0.4,
        y: 0.4,
        z: -1,
        duration: 1.5,
        ease: "power1.inOut",
      },
      "<"
    );

    // 2. fade light out
    tl.to(lightRef.current, {
      intensity: 0,
      duration: 0.5,
      ease: "power2.in",
    }, '-=0.5');

    // 3. change camera to orthographic 
    tl.call(() => {
      if (orthoCamRef.current) {
        isOrthoRef.current = true;
        orthoCamRef.current.zoom = 233;
        orthoCamRef.current.updateProjectionMatrix();
        set(() => ({ camera: orthoCamRef.current }));
      }
    });

    // short delay
    tl.to({}, { duration: 0.25, onStart: () => {
      if (!lightRef.current) return;
      lightRef.current.position.set(2, 1, 0);
    } });

    // 4. light on again + move to other side 
    tl.to(lightRef.current, {
      intensity: 10,
      duration: 0.3,
      ease: "power2.out",
    });

    tl.to(
      lightRef.current.position,
      {
        x: 1,
        y: 0,
        z: 2,
        duration: 1,
        ease: "power1.inOut",
      },
      "<"
    );

    // change light to black
    tl.to(
        lightRef.current.color,
        {
            r: 0,
            g: 0,
            b: 0,
            duration: 0.5,
            ease: "power2.inOut",
        },
        ">"
    );

    return () => {
      tl.kill();
    };
  }, [isReady]);

  return (
    <>
      <PerspectiveCamera
        ref={perspCamRef}
        makeDefault
        position={[0, 0, 5]}
        fov={initialPerspFOV}
      />
      <OrthographicCamera
        ref={orthoCamRef}
        position={[0, 0, 50]}
        near={-100}
        far={1000}
        zoom={233}
      />

      <directionalLight
        ref={lightRef}
        position={[-0.05, 0, -3]}
        intensity={0}
        color="#E85A0B"
      />

      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0} />
      </Suspense>
      <Suspense fallback={null}>
        <GlassLogo isReady={isReady} onReady={onReady} />
      </Suspense>
    </>
  );
}

interface LogoProps {
  isReady: boolean;
  onReady: () => void;
  onLightRevealed?: () => void;
}

export default memo(function Logo({ isReady, onReady, onLightRevealed }: LogoProps) {
  return (
    <div className="absolute w-screen h-[100dvh] top-0 left-0 z-30 pointer-events-none select-none">
      <Canvas
        dpr={[1, 1.5]}
        style={{ pointerEvents: "none" }}
        className="pointer-events-none"
        onCreated={({ scene }) => {
          scene.environmentIntensity = 0;
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <Scene
          isReady={isReady}
          onReady={onReady}
          onLightRevealed={onLightRevealed}
        />
      </Canvas>
    </div>
  );
});

useGLTF.preload("/lightspeed.glb")