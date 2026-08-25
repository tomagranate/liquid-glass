import type { ComponentType, SVGProps } from "react";
import {
  CameraIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  EnvelopeIcon,
  MapPinIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/solid";
import { GlassOverPage } from "@tomagranate/liquid-glass/react";
import "./components.css";

interface DockApp {
  id: string;
  label: string;
  gradient: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const APPS: DockApp[] = [
  {
    id: "messages",
    label: "Messages",
    gradient: "linear-gradient(180deg, #6be07a, #12b845)",
    Icon: ChatBubbleOvalLeftEllipsisIcon,
  },
  {
    id: "music",
    label: "Music",
    gradient: "linear-gradient(180deg, #ff6e8b, #f5273e)",
    Icon: MusicalNoteIcon,
  },
  {
    id: "mail",
    label: "Mail",
    gradient: "linear-gradient(180deg, #4da8ff, #1668e3)",
    Icon: EnvelopeIcon,
  },
  {
    id: "maps",
    label: "Maps",
    gradient: "linear-gradient(180deg, #4de3c9, #0e9c8f)",
    Icon: MapPinIcon,
  },
  {
    id: "camera",
    label: "Camera",
    gradient: "linear-gradient(180deg, #5c6270, #2e3340)",
    Icon: CameraIcon,
  },
  {
    id: "clock",
    label: "Clock",
    gradient: "linear-gradient(180deg, #3a3f4c, #15181f)",
    Icon: ClockIcon,
  },
  {
    id: "settings",
    label: "Settings",
    gradient: "linear-gradient(180deg, #9aa1ae, #565d6b)",
    Icon: Cog6ToothIcon,
  },
  {
    id: "terminal",
    label: "Terminal",
    gradient: "linear-gradient(180deg, #23262e, #0b0d12)",
    Icon: CommandLineIcon,
  },
];

const DOCK_GLASS = {
  radius: 32,
  depth: 24,
  scale: 84,
  blur: 0.4,
  chroma: 0.55,
  specular: 0.4,
  rimLight: 1,
  tint: "rgba(255,255,255,0.05)",
  shadow: "0 24px 60px rgba(0,0,0,0.42)",
};

/**
 * A macOS-style dock: one glass slab refracting the wallpaper, app icons riding
 * on top in the content layer with a springy hover lift.
 */
export function GlassDock() {
  return (
    <div className="glassx-dock">
      <GlassOverPage
        className="glassx-dock-slab"
        {...DOCK_GLASS}
        aria-hidden="true"
      />
      <div className="glassx-dock-row">
        {APPS.map(({ id, label, gradient, Icon }) => (
          <button
            key={id}
            type="button"
            className="glassx-dock-app"
            title={label}
            aria-label={label}
          >
            <span
              className="glassx-dock-icon"
              style={{ background: gradient }}
              aria-hidden="true"
            >
              <Icon className="glassx-dock-glyph" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default GlassDock;
