import { OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type Bounds = [left: number, top: number, right: number, bottom: number];
export type Graphics = { images: Bounds[]; fills: { bounds: Bounds; color: string }[] };

export function pageGraphics(
  { fnArray, argsArray }: { fnArray: number[]; argsArray: any[] },
  viewport: number[],
): Graphics {
  const images: Bounds[] = [];
  const fills: Graphics['fills'] = [];
  const stack: { transform: number[]; color: string; alpha: number }[] = [];
  let state = { transform: viewport, color: '#000000', alpha: 1 };
  const box = (coordinates: number[], transform = state.transform) => {
    const rect: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
    Util.axialAlignedBoundingBox(coordinates, transform, rect);
    return rect;
  };
  for (const [i, op] of fnArray.entries()) {
    const args = argsArray[i];
    if (op === OPS.save || op === OPS.paintFormXObjectBegin || op === OPS.beginGroup) {
      stack.push({ ...state });
      const matrix =
        op === OPS.paintFormXObjectBegin
          ? args?.[0]
          : op === OPS.beginGroup
            ? args?.[0]?.matrix
            : undefined;
      if (matrix) state.transform = Util.transform(state.transform, matrix);
    } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd || op === OPS.endGroup) {
      state = stack.pop() ?? state;
    } else if (op === OPS.transform) {
      state.transform = Util.transform(state.transform, args);
    } else if (op === OPS.setFillRGBColor) {
      state.color = args[0];
    } else if (op === OPS.setGState) {
      const pair = args[0].find(([key]: [string, unknown]) => key === 'ca');
      if (pair) state.alpha = pair[1];
    } else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) {
      images.push(box([0, 0, 1, 1]));
    } else if (op === OPS.paintImageXObjectRepeat) {
      const [, sx, sy, positions] = args;
      for (let j = 0; j < positions.length; j += 2)
        images.push(
          box(
            [0, 0, 1, 1],
            Util.transform(state.transform, [sx, 0, 0, sy, positions[j], positions[j + 1]]),
          ),
        );
    } else if (op === OPS.paintInlineImageXObjectGroup) {
      for (const item of args[1])
        images.push(box([0, 0, 1, 1], Util.transform(state.transform, item.transform)));
    } else if (
      op === OPS.constructPath &&
      args[2] &&
      state.alpha > 0.15 &&
      (
        [
          OPS.fill,
          OPS.eoFill,
          OPS.fillStroke,
          OPS.closeFillStroke,
          OPS.eoFillStroke,
          OPS.closeEOFillStroke,
        ] as number[]
      ).includes(args[0])
    ) {
      const bounds = box(args[2]);
      if (bounds[2] - bounds[0] >= 9 && bounds[3] - bounds[1] >= 5)
        fills.push({ bounds, color: state.color });
    }
  }
  return { images, fills };
}
