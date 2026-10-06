import { expect, it } from "vitest";
import { boardOrigin } from "./board-viewport";

it("keeps negative and boundary positions reachable without changing saved coordinates", () => {
  const items = [{ x: -10000, y: -230 }, { x: 10000, y: 70 }];
  const before = structuredClone(items);
  const origin = boardOrigin(items);
  expect(items.map(item => item.x + origin.x)).toEqual([48, 20048]);
  expect(items.map(item => item.y + origin.y)).toEqual([80, 380]);
  expect(items).toEqual(before);
  expect(boardOrigin([])).toEqual({ x: 48, y: 80 });
});
