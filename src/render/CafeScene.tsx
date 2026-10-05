import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createLayout, FLOOR } from "../sim/cafe/layout";
import { STATE_LABEL, type Customer, type SimSnapshot } from "../sim/cafe/types";
import { AGE_COLOR, STATE_COLOR } from "./colors";

type Props = {
  snapshot: SimSnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

function useWoodTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#e4c7a4";
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row += 1) {
      ctx.fillStyle = row % 2 === 0 ? "#e7c9a6" : "#d7b08a";
      ctx.fillRect(0, row * 64, 512, 64);
      ctx.strokeStyle = "rgba(92, 58, 28, 0.16)";
      ctx.beginPath();
      ctx.moveTo(0, row * 64);
      ctx.lineTo(512, row * 64);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 2);
    return texture;
  }, []);
}

function useLabelTexture(text: string, color: string) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(42, 32, 26, 0.9)";
    ctx.fillRect(24, 28, 464, 72);
    ctx.fillStyle = color;
    ctx.font = "600 46px Malgun Gothic, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [text, color]);
}

function FloorLabel({
  text,
  position,
  color,
  width = 1.35,
  height = 0.34,
}: {
  text: string;
  position: [number, number, number];
  color: string;
  width?: number;
  height?: number;
}) {
  const texture = useLabelTexture(text, color);
  if (!texture) return null;
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function CameraRig() {
  const { camera, gl } = useThree();
  const rig = useRef({ dragging: false, x: 0, y: 0, theta: 2.45, phi: 0.98, radius: 19 });

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      rig.current.dragging = true;
      rig.current.x = event.clientX;
      rig.current.y = event.clientY;
    };
    const onUp = () => {
      rig.current.dragging = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!rig.current.dragging) return;
      const dx = event.clientX - rig.current.x;
      const dy = event.clientY - rig.current.y;
      rig.current.x = event.clientX;
      rig.current.y = event.clientY;
      rig.current.theta -= dx * 0.005;
      rig.current.phi = Math.min(1.25, Math.max(0.45, rig.current.phi + dy * 0.0035));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      rig.current.radius = Math.min(28, Math.max(10, rig.current.radius + event.deltaY * 0.012));
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  useFrame(() => {
    const { theta, phi, radius } = rig.current;
    camera.position.set(
      Math.sin(phi) * Math.sin(theta) * radius,
      Math.cos(phi) * radius + 1.4,
      Math.sin(phi) * Math.cos(theta) * radius,
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function ZonePad({
  slots,
  color,
  opacity = 0.28,
}: {
  slots: { x: number; z: number }[];
  color: string;
  opacity?: number;
}) {
  const box = useMemo(() => {
    const xs = slots.map((slot) => slot.x);
    const zs = slots.map((slot) => slot.z);
    const minX = Math.min(...xs) - 0.55;
    const maxX = Math.max(...xs) + 0.55;
    const minZ = Math.min(...zs) - 0.55;
    const maxZ = Math.max(...zs) + 0.55;
    return {
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
    };
  }, [slots]);

  return (
    <mesh position={[box.x, 0.025, box.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[box.w, box.d]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

function Person({
  customer,
  simTime,
  selected,
  onSelect,
}: {
  customer: Customer;
  simTime: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const yaw = useRef(0);
  const dx = customer.target.x - customer.position.x;
  const dz = customer.target.z - customer.position.z;
  if (Math.hypot(dx, dz) > 0.08) yaw.current = Math.atan2(dx, dz);
  const moving = Math.hypot(dx, dz) > 0.2;
  const bob = moving ? Math.abs(Math.sin(simTime * 8 + customer.age)) * 0.05 : 0;
  const height = customer.age < 16 ? 0.86 : customer.age > 75 ? 0.92 : 1;
  const body = AGE_COLOR[customer.ageBand];

  return (
    <group
      position={[customer.position.x, bob, customer.position.z]}
      rotation={[0, yaw.current, 0]}
      scale={height}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(customer.id);
      }}
    >
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} />
      </mesh>
      {customer.groupSize > 1 && customer.isOrderer && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.24, 0.32, 20]} />
          <meshBasicMaterial color="#fffaf3" />
        </mesh>
      )}
      <mesh position={[0, 0.58, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 4, 10]} />
        <meshStandardMaterial color={body} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#f0c7a8" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={STATE_COLOR[customer.state]} />
      </mesh>
      {selected && (
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
}

function KioskUnit({
  position,
  occupied,
  label,
}: {
  position: [number, number, number];
  occupied: boolean;
  label: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.72, 1.1, 0.42]} />
        <meshStandardMaterial color="#2c2622" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.72, -0.22]}>
        <boxGeometry args={[0.52, 0.42, 0.04]} />
        <meshStandardMaterial
          color={occupied ? "#ff5d73" : "#3ddc97"}
          emissive={occupied ? "#ff5d73" : "#3ddc97"}
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh position={[0, 0.18, -0.28]}>
        <boxGeometry args={[0.46, 0.08, 0.28]} />
        <meshStandardMaterial color="#4a4038" />
      </mesh>
      <FloorLabel text={label} position={[0, 1.22, 0.15]} color="#fff8ef" width={0.46} height={0.28} />
    </group>
  );
}

export function CafeWorld({ snapshot, selectedId, onSelect }: Props) {
  const wood = useWoodTexture();
  const layout = useMemo(
    () => createLayout(snapshot.kiosks.length || 1),
    [snapshot.kiosks.length],
  );
  const visible = snapshot.customers.filter((customer) => customer.state !== "COMPLETED");

  return (
    <>
      <color attach="background" args={["#e7d7c6"]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#fff4e8", "#c4a484", 0.45]} />
      <directionalLight position={[7, 14, 6]} intensity={1.15} />
      <pointLight position={[5.2, 3.2, -2.4]} intensity={6} distance={10} color="#ffd7a8" />
      <CameraRig />

      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={() => onSelect(null)}>
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshStandardMaterial map={wood ?? undefined} color={wood ? "#ffffff" : "#e4c7a4"} roughness={0.9} />
      </mesh>

      <ZonePad slots={layout.queueSlots} color="#f0b429" opacity={0.22} />
      <ZonePad slots={layout.waitSpots} color="#5ad7c6" opacity={0.18} />
      <ZonePad slots={layout.pickupSpots} color="#8be07a" opacity={0.2} />

      <mesh position={[5.35, 0.03, -4.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.7, 3.1]} />
        <meshStandardMaterial color="#f3e1cf" />
      </mesh>
      <mesh position={[5.35, 0.92, -2.55]}>
        <boxGeometry args={[4.5, 0.16, 0.7]} />
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      <mesh position={[5.35, 0.45, -4.5]}>
        <boxGeometry args={[4.2, 0.9, 0.35]} />
        <meshStandardMaterial color="#8d5a3b" />
      </mesh>

      {snapshot.orders
        .filter((order) => order.status === "preparing" || order.status === "ready")
        .slice(0, 12)
        .map((order, index) => (
          <mesh
            key={order.id}
            position={[3.5 + (index % 6) * 0.55, 1.08, -4.45 - Math.floor(index / 6) * 0.45]}
          >
            <boxGeometry args={[0.32, 0.14, 0.32]} />
            <meshStandardMaterial
              color={order.status === "ready" ? "#8be07a" : "#e6a15c"}
              emissive={order.status === "ready" ? "#8be07a" : "#000000"}
              emissiveIntensity={order.status === "ready" ? 0.35 : 0}
            />
          </mesh>
        ))}

      <Walls />

      <mesh position={[-7.15, 0.02, 4.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.1, 1.3]} />
        <meshStandardMaterial color="#7dcea0" />
      </mesh>
      <mesh position={[-7.15, 0.02, -4.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.1, 1.3]} />
        <meshStandardMaterial color="#e7a0a0" />
      </mesh>

      <FloorLabel text="입구" position={[-5.55, 0.08, 4.45]} color="#d8ffe8" />
      <FloorLabel text="출구" position={[-5.55, 0.08, -4.45]} color="#ffd0d0" />
      <FloorLabel text="대기열" position={[-5.15, 0.08, 0.2]} color="#ffe3b0" />
      <FloorLabel text="대기 공간" position={[-0.35, 0.08, 1.85]} color="#d8fff8" />
      <FloorLabel text="픽업" position={[4.55, 0.08, -0.15]} color="#e5ffd8" />
      <FloorLabel text="주방" position={[5.2, 0.08, -3.7]} color="#ffe7d2" />

      {snapshot.kiosks.map((kiosk, index) => (
        <KioskUnit
          key={kiosk.id}
          position={[kiosk.position.x, 0, kiosk.position.z]}
          occupied={kiosk.status === "occupied"}
          label={`${index + 1}`}
        />
      ))}

      {layout.queueSlots.map((slot, index) => (
        <mesh key={`q-${index}`} position={[slot.x, 0.03, slot.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.16, 14]} />
          <meshBasicMaterial color="#c4842a" transparent opacity={0.45} />
        </mesh>
      ))}

      <Table position={[6.3, 0, 3.5]} />
      <Table position={[6.3, 0, 2.1]} />
      <Plant position={[7.15, 0, 4.7]} />
      <Plant position={[7.15, 0, -5.2]} />

      {visible.map((customer) => (
        <Person
          key={customer.id}
          customer={customer}
          simTime={snapshot.time}
          selected={customer.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function Table({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.08, 18]} />
        <meshStandardMaterial color="#f7f1ea" />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.7, 10]} />
        <meshStandardMaterial color="#5c4636" />
      </mesh>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.16, 0.14, 0.32, 10]} />
        <meshStandardMaterial color="#8d5a3b" />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial color="#3f7d4e" />
      </mesh>
    </group>
  );
}

function Walls() {
  const color = "#f7f1ea";
  const h = 2.4;
  const y = h / 2;
  return (
    <group>
      <mesh position={[0, y, -6]}>
        <boxGeometry args={[16, h, 0.18]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, y, 6]}>
        <boxGeometry args={[16, h, 0.18]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[8, y, 0]}>
        <boxGeometry args={[0.18, h, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-8, y, -5.65]}>
        <boxGeometry args={[0.18, h, 0.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-8, y, 0]}>
        <boxGeometry args={[0.18, h, 7.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-8, y, 5.65]}>
        <boxGeometry args={[0.18, h, 0.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-8, h - 0.28, 4.45]}>
        <boxGeometry args={[0.18, 0.56, 1.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-8, h - 0.28, -4.45]}>
        <boxGeometry args={[0.18, 0.56, 1.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function CafeScene(props: Props) {
  return (
    <Canvas camera={{ position: [8, 12, -13], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <CafeWorld {...props} />
    </Canvas>
  );
}

export function stateHeadline(customer: Customer): string {
  const group = customer.groupSize > 1 ? ` · ${customer.groupSize}명 그룹` : "";
  const role = customer.groupSize > 1 ? (customer.isOrderer ? " · 주문자" : " · 동행") : "";
  return `${customer.age}세 · ${STATE_LABEL[customer.state]}${group}${role}`;
}
