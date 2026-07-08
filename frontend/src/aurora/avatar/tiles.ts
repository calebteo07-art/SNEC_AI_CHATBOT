/* Studio option-tile art paths. One static webp per non-colour option id, generated
   offline by tools/avatar/generate_tiles.py (placeholders first, paid art on
   go-ahead) and committed under frontend/public/avatar/tiles/<axis>/<id>.webp.
   "none" options show the pristine default mascot. */
const IRIS_SRC = "/brand/iris.png";

export function tileSrc(axis: string, id: string): string {
  if (id === "none") return IRIS_SRC;
  return `/avatar/tiles/${axis}/${id}.webp`;
}
