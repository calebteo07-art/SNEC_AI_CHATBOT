/* Pure config → ordered render-layer model for <Eyecon>. Back→front: body base,
   body-colour tint (masked to the body silhouette = the base's own alpha), outfit,
   eye (eyeShape overlay w/ neutral iris), iris-colour tint (masked to the eye's iris
   region), accessory, topper. Colour axes are `tint` layers (CSS multiply); the rest
   are isolated transparent overlays registered to a shared 512² space. `none` omits
   its layer; eyeShape is always present. Hook-free + deterministic so it unit-tests
   in raw Node and renders identically on server or client. */
import type { AvatarConfig } from "./axes.generated";
import { DEFAULT_AVATAR } from "./axes.generated";
import { BODY_COLORS, IRIS_COLORS } from "./manifest";

export type EyeconLayer =
  | { kind: "image"; key: string; z: number; src: string }
  | { kind: "tint"; key: string; z: number; color: string; maskSrc: string };

export const BASE_BODY_SRC = "/avatar/base/body.webp";
export const overlaySrc = (axis: string, id: string): string => `/avatar/overlay/${axis}/${id}.webp`;
export const irisMaskSrc = (eyeShape: string): string => `/avatar/overlay/eyeShape/${eyeShape}.iris.webp`;

export function eyeconLayers(config?: Partial<AvatarConfig> | null): EyeconLayer[] {
  const c = { ...DEFAULT_AVATAR, ...(config ?? {}) } as AvatarConfig;
  const layers: EyeconLayer[] = [{ kind: "image", key: "body", z: 10, src: BASE_BODY_SRC }];

  const bodyHex = BODY_COLORS[c.bodyColor as keyof typeof BODY_COLORS];
  if (bodyHex) layers.push({ kind: "tint", key: "bodyTint", z: 11, color: bodyHex, maskSrc: BASE_BODY_SRC });

  if (c.outfit && c.outfit !== "none")
    layers.push({ kind: "image", key: "outfit", z: 20, src: overlaySrc("outfit", c.outfit) });

  layers.push({ kind: "image", key: "eye", z: 30, src: overlaySrc("eyeShape", c.eyeShape) });

  const irisHex = IRIS_COLORS[c.irisColor as keyof typeof IRIS_COLORS];
  if (irisHex) layers.push({ kind: "tint", key: "irisTint", z: 31, color: irisHex, maskSrc: irisMaskSrc(c.eyeShape) });

  if (c.accessory && c.accessory !== "none")
    layers.push({ kind: "image", key: "accessory", z: 40, src: overlaySrc("accessory", c.accessory) });

  if (c.topper && c.topper !== "none")
    layers.push({ kind: "image", key: "topper", z: 50, src: overlaySrc("topper", c.topper) });

  return layers;
}
