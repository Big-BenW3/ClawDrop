import { getDriver } from "./index";

/**
 * Merges the thumb joystick and the keyboard into one steering vector for the driver.
 * Both sources only ever set a vector; the driver decides what the claw does with it.
 */
const joy = { x: 0, z: 0 };
const keys = new Set<string>();

function push() {
  let x = joy.x, z = joy.z;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (keys.has("w") || keys.has("arrowup")) z -= 1;
  if (keys.has("s") || keys.has("arrowdown")) z += 1;
  getDriver().setInput(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, z)));
}

export const input = {
  setJoystick(x: number, z: number) { joy.x = x; joy.z = z; push(); },
  keyDown(key: string) { keys.add(key.toLowerCase()); push(); },
  keyUp(key: string) { keys.delete(key.toLowerCase()); push(); },
  clear() { joy.x = 0; joy.z = 0; keys.clear(); push(); },
};
