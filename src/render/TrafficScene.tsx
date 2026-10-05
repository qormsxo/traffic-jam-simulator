import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace } from "three";
import { buildNetwork, type Marking, type Network } from "../sim/traffic/network";
import {
  APPROACH_LABEL,
  APPROACH_ORDER,
  MOVEMENT_LABEL,
  STATE_LABEL,
  laneLabel,
  type ApproachId,
  type SignalView,
  type SimSnapshot,
  type Vehicle,
} from "../sim/traffic/types";
import { LIGHT_COLOR, vehicleColor } from "./colors";

type Props = {
  snapshot: SimSnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/** 선택 차량의 상태와 속도를 한 줄로 만듦 */
export function vehicleHeadline(vehicle: Vehicle): string {
  return `${STATE_LABEL[vehicle.state]} · ${(vehicle.speed * 3.6).toFixed(0)} km/h`;
}

/** 도로와 차를 3D로 보여 줌 */
export function TrafficScene({ snapshot, selectedId, onSelect }: Props) {
  const network = useMemo(() => buildNetwork(snapshot.laneCount), [snapshot.laneCount]);

  return (
    <Canvas camera={{ position: [70, 78, 70], fov: 38 }} dpr={[1, 1.75]}>
      <color attach="background" args={["#1a242c"]} />
      <ambientLight intensity={0.62} />
      <hemisphereLight args={["#d5e4f0", "#314036", 0.5]} />
      <directionalLight position={[48, 90, 24]} intensity={1.2} />
      <CameraRig span={network.armLength + network.half} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} onClick={() => onSelect(null)}>
        <planeGeometry args={[420, 420]} />
        <meshStandardMaterial color="#24312b" />
      </mesh>
      <Roads network={network} />
      <Signals network={network} signal={snapshot.signals} />
      {snapshot.vehicles.map((vehicle) => (
        <Car
          key={vehicle.id}
          vehicle={vehicle}
          selected={vehicle.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </Canvas>
  );
}

/** 드래그로 돌리고 휠로 줌하는 카메라를 붙임 */
function CameraRig({ span }: { span: number }) {
  const { camera, gl } = useThree();

  const rig = useRef({
    dragging: false,
    x: 0,
    y: 0,
    // 긴 직진 도로의 차선이 보이도록 위에서 비스듬히 봄
    theta: 0.2,
    phi: 0.62,
    radius: Math.min(150, Math.max(88, span * 0.7)),
  });

  useEffect(() => {
    const el = gl.domElement;

    /** 왼쪽 버튼을 누르면 드래그를 시작함 */
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      rig.current.dragging = true;
      rig.current.x = event.clientX;
      rig.current.y = event.clientY;
    };

    /** 버튼을 놓으면 드래그를 끝냄 */
    const onUp = () => {
      rig.current.dragging = false;
    };

    /** 드래그 중이면 카메라 각도를 바꿈 */
    const onMove = (event: PointerEvent) => {
      if (!rig.current.dragging) return;
      const dx = event.clientX - rig.current.x;
      const dy = event.clientY - rig.current.y;
      rig.current.x = event.clientX;
      rig.current.y = event.clientY;
      rig.current.theta -= dx * 0.005;
      rig.current.phi = Math.min(1.28, Math.max(0.35, rig.current.phi + dy * 0.0035));
    };

    /** 휠로 카메라 거리를 바꿈 */
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      rig.current.radius = Math.min(360, Math.max(42, rig.current.radius + event.deltaY * 0.045));
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
      Math.cos(phi) * radius + 2,
      Math.sin(phi) * Math.cos(theta) * radius,
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/** 포장, 차선, 도로 글자를 보여 줌 */
function Roads({ network }: { network: Network }) {
  return (
    <group>
      {network.slabs.map((slab, index) => (
        <mesh key={`slab-${index}`} position={slab.position}>
          <boxGeometry args={slab.size} />
          <meshStandardMaterial color={slab.color} roughness={0.92} />
        </mesh>
      ))}
      {network.markings.map((marking, index) => (
        <Stripe key={`mark-${index}`} marking={marking} />
      ))}
      {network.labels.map((label) => (
        <RoadLabel key={label.text} text={label.text} position={[label.position.x, 0.12, label.position.z]} />
      ))}
    </group>
  );
}

/** 차선 표시 하나를 바닥에 놓음 */
function Stripe({ marking }: { marking: Marking }) {
  const dx = marking.to.x - marking.from.x;
  const dz = marking.to.z - marking.from.z;
  const length = Math.hypot(dx, dz);

  if (length < 0.05) return null;

  return (
    <mesh
      position={[(marking.from.x + marking.to.x) / 2, 0.08, (marking.from.z + marking.to.z) / 2]}
      rotation={[0, Math.atan2(dx, dz), 0]}
    >
      <boxGeometry args={[marking.width, 0.025, length]} />
      <meshStandardMaterial color={marking.color} roughness={0.7} />
    </mesh>
  );
}

/** 도로 위 글자 텍스처를 만듦 */
function RoadLabel({ text, position }: { text: string; position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(16, 22, 28, 0.82)";
    ctx.fillRect(16, 28, 480, 72);
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "600 42px Malgun Gothic, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;

    return map;
  }, [text]);

  if (!texture) return null;

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[7.2, 1.8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** 신호 기둥과 등을 보여 줌 */
function Signals({ network, signal }: { network: Network; signal: SignalView }) {
  return (
    <group>
      {network.poles.map((pole) => {
        const head = signal[pole.approach];

        return (
          <group key={pole.approach} position={[pole.position.x, 0, pole.position.z]} rotation={[0, pole.rotation, 0]}>
            <mesh position={[0, 2.15, 0]}>
              <cylinderGeometry args={[0.08, 0.1, 4.3, 8]} />
              <meshStandardMaterial color="#1b1f24" />
            </mesh>
            <mesh position={[0, 4.15, 0.16]}>
              <boxGeometry args={[0.42, 1.15, 0.18]} />
              <meshStandardMaterial color="#121418" />
            </mesh>
            <Lamp position={[0, 4.48, 0.3]} color={LIGHT_COLOR[head.through]} />
            <Lamp position={[0, 3.95, 0.3]} color={LIGHT_COLOR[head.left]} size={0.1} />
          </group>
        );
      })}
    </group>
  );
}

/** 신호등 전구 하나를 보여 줌 */
function Lamp({
  position,
  color,
  size = 0.13,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
}) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} />
    </mesh>
  );
}

/** 차 한 대를 보여 줌 클릭하면 설명창을 열어 줌 */
function Car({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const color = vehicleColor(vehicle.id, vehicle.speed, vehicle.maxSpeed);
  const braking = vehicle.state === "BRAKING" || vehicle.acceleration < -0.45 || vehicle.speed < 1.1;

  return (
    <group
      position={[vehicle.position.x, 0, vehicle.position.z]}
      rotation={[0, vehicle.heading, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(vehicle.id);
      }}
    >
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[1.72, 0.72, 4.35]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.92, -0.35]}>
        <boxGeometry args={[1.5, 0.5, 1.7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.96, 0.72]}>
        <boxGeometry args={[1.32, 0.4, 0.85]} />
        <meshStandardMaterial color="#d5e6f2" roughness={0.2} />
      </mesh>
      <mesh position={[0.55, 0.46, 2.12]}>
        <boxGeometry args={[0.28, 0.16, 0.08]} />
        <meshStandardMaterial color="#fff4cc" emissive="#fff4cc" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[-0.55, 0.46, 2.12]}>
        <boxGeometry args={[0.28, 0.16, 0.08]} />
        <meshStandardMaterial color="#fff4cc" emissive="#fff4cc" emissiveIntensity={0.7} />
      </mesh>
      {braking && (
        <>
          <mesh position={[0.55, 0.48, -2.16]}>
            <boxGeometry args={[0.3, 0.14, 0.06]} />
            <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
          <mesh position={[-0.55, 0.48, -2.16]}>
            <boxGeometry args={[0.3, 0.14, 0.06]} />
            <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
        </>
      )}
      {vehicle.state === "CUTTING_IN" && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.7, 2.05, 24]} />
          <meshBasicMaterial color="#f0b429" />
        </mesh>
      )}
      {vehicle.state === "BRAKING" && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.7, 2.05, 24]} />
          <meshBasicMaterial color="#ff4d3a" />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.15, 2.45, 28]} />
          <meshBasicMaterial color="#f4d35e" />
        </mesh>
      )}
    </group>
  );
}

/** 차선 id의 앞부분이 방향이면 그 방향을 돌려줌 */
function approachOf(value: string | undefined): ApproachId | null {
  if (value === undefined) return null;

  for (const approach of APPROACH_ORDER) {
    if (approach === value) return approach;
  }

  return null;
}

/** 설명창에 넣을 항목 목록을 만듦 */
export function vehicleDetail(vehicle: Vehicle): { label: string; value: string }[] {
  const [road, indexText] = vehicle.laneId.split("-");
  const approach = approachOf(road);
  const lane = approach === null ? vehicle.laneId : laneLabel(approach, Number(indexText));

  return [
    { label: "상태", value: STATE_LABEL[vehicle.state] },
    { label: "방향", value: `${APPROACH_LABEL[vehicle.approach]} · ${MOVEMENT_LABEL[vehicle.movement]}` },
    { label: "차선", value: lane },
    { label: "속도", value: `${(vehicle.speed * 3.6).toFixed(1)} km/h` },
    { label: "최고속도", value: `${(vehicle.maxSpeed * 3.6).toFixed(1)} km/h` },
    { label: "가속도", value: `${vehicle.acceleration.toFixed(2)} m/s²` },
    { label: "대기", value: `${vehicle.waitTime.toFixed(1)}초` },
    { label: "주행거리", value: `${vehicle.distance.toFixed(0)} m` },
  ];
}
