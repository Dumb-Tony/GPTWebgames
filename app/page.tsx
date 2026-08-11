import type { Metadata } from "next";
import { MoonGoonsGame } from "./game/MoonGoonsGame";

export const metadata: Metadata = {
  title: "Moon Goons — Two-Destination Field Test",
  description:
    "Bad science. Worse equipment. One last trip to the ship.",
};

export default function Home() {
  return <MoonGoonsGame />;
}
