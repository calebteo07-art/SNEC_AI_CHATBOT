/* PHOTOPIC · generative media types — mirrors tools/media/build_manifest.py */

export type NavContext =
  | "login"
  | "checkin"
  | "dashboard"
  | "cases"
  | "case-session"
  | "flashcards"
  | "summary"
  | "progress"
  | "supervisor"
  | "admin"
  | "profile";

export interface Accent {
  id: string;
  kind: "svg" | "raster";
  context: NavContext[];
  path: string;
  width: number | null;
  height: number | null;
  hash: string;
}

export interface LoopSpec {
  id: string;
  src: string;
  poster: string | null;
  context: NavContext[];
  hash: string;
}

export interface MediaManifest {
  version: number;
  generatedAt: string;
  palette: string;
  accents: Accent[];
  loops: LoopSpec[];
}
