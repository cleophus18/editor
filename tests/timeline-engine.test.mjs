import assert from "node:assert/strict";
import test from "node:test";
import {
  addKeyframeToClip,
  animatedClipSettings,
  audioGainAt,
  evaluateProperty,
  keyframesForProperty,
  makeKeyframe,
  moveKeyframe,
  removeKeyframe,
  setKeyframeValue,
  slideEdit,
  slipEdit,
  rollEdit,
  staticPropertyValue,
  groupClips,
  ungroupClips,
  clipEnd,
} from "../src/types.ts";

const baseClip = (overrides = {}) => ({
  id: "c1",
  track: "overlay",
  name: "Clip",
  start: 0,
  inPoint: 0,
  duration: 5,/*/
  speed: 1,
  volume: 1,
  muted: false,
  ...overrides,
});

test("evaluateProperty interpolates linearly between keyframes", () => {
  const clip = baseClip({
    keyframes: {
      properties: { scale: [makeKeyframe(0, 100), makeKeyframe(5, 200)] },
    },
  });
  assert.equal(evaluateProperty(clip, "scale", 0), 100);
  assert.equal(evaluateProperty(clip, "scale", 2.5), 150);
  assert.equal(evaluateProperty(clip, "scale", 5), 200);
  // before first keyframe clamps, after last clamps
  assert.equal(evaluateProperty(clip, "scale", -1), 100);
  assert.equal(evaluateProperty(clip, "scale", 9), 200);
});

test("evaluateProperty easing types produce different midpoints", () => {
  const clip = baseClip({
    keyframes: {
      properties: {
        opacity: [makeKeyframe(0, 0), makeKeyframe(2, 100, "ease-in")],
      },
    },
  });
  const easeIn = evaluateProperty(clip, "opacity", 1);
  const linear = evaluateProperty(
    {
      ...clip,
      keyframes: {
        properties: {
          opacity: [makeKeyframe(0, 0), makeKeyframe(2, 100, "linear")],
        },
      },
    },
    "opacity",
    1,
  );
  assert.ok(
    easeIn < 50,
    `ease-in midpoint ${easeIn} should be below linear midpoint`,
  );
  assert.equal(linear, 50);
});

test("setKeyframeValue adds and updates keyframes without duplicating near-identical frames", () => {
  let clip = setKeyframeValue(baseClip(), "positionX", 1, 10);
  assert.equal(keyframesForProperty(clip, "positionX").length, 1);
  clip = setKeyframeValue(clip, "positionX", 3, 30);
  clip = setKeyframeValue(clip, "positionX", 1.02, 15); // within 0.05s tolerance -> update
  const frames = keyframesForProperty(clip, "positionX");
  assert.equal(frames.length, 2);
  assert.equal(frames[0].value, 15);
});

test("removeKeyframe deletes a single frame and clears the property when empty", () => {
  let clip = setKeyframeValue(baseClip(), "scale", 0, 100);
  const [frame] = keyframesForProperty(clip, "scale");
  clip = removeKeyframe(clip, "scale", frame.id);
  assert.equal(keyframesForProperty(clip, "scale").length, 0);
  assert.ok(!clip.keyframes?.properties.scale);
});

test("moveKeyframe re-sorts frames after moving", () => {
  let clip = setKeyframeValue(baseClip(), "opacity", 0, 0);
  clip = setKeyframeValue(clip, "opacity", 4, 100);
  const [first] = keyframesForProperty(clip, "opacity");
  clip = moveKeyframe(clip, "opacity", first.id, 5);
  const frames = keyframesForProperty(clip, "opacity");
  assert.deepEqual(
    frames.map((f) => f.time),
    [4, 5],
  );
});

test("animatedClipSettings returns static values when no keyframes exist", () => {
  const clip = baseClip({ positionX: 20, scale: 150, opacity: 55 });
  const settings = animatedClipSettings(clip, 2);
  assert.equal(settings.positionX, 20);
  assert.equal(settings.scale, 150);
  assert.equal(settings.opacity, 55);
});

test("animatedClipSettings animates position and opacity over time", () => {
  const clip = baseClip({
    positionX: 0,
    keyframes: {
      properties: {
        positionX: [makeKeyframe(0, -40), makeKeyframe(4, 40)],
        opacity: [makeKeyframe(0, 0), makeKeyframe(1, 100)],
      },
    },
  });
  assert.equal(animatedClipSettings(clip, 0).positionX, -40);
  assert.equal(animatedClipSettings(clip, 2).positionX, 0);
  assert.equal(animatedClipSettings(clip, 4).positionX, 40);
  assert.equal(animatedClipSettings(clip, 0.5).opacity, 50);
  assert.equal(animatedClipSettings(clip, 2).opacity, 100);
});

test("audioGainAt applies volume, fades, and volume keyframes", () => {
  const plain = baseClip({ volume: 0.5, start: 0, duration: 10 });
  assert.equal(audioGainAt(plain, 5), 0.5);
  const faded = baseClip({ volume: 1, fadeIn: 2, fadeOut: 2, duration: 10 });
  assert.equal(audioGainAt(faded, 0), 0);
  assert.equal(audioGainAt(faded, 1), 0.5);
  assert.equal(audioGainAt(faded, 5), 1);
  assert.equal(audioGainAt(faded, 9), 0.5);
  assert.equal(audioGainAt(faded, 10), 0);
  const keyframed = baseClip({
    keyframes: {
      properties: { volume: [makeKeyframe(0, 100), makeKeyframe(4, 0)] },
    },
  });
  assert.equal(audioGainAt(keyframed, 2), 0.5);
});

test("slipEdit changes the source section without moving the clip", () => {
  const clip = baseClip({ start: 10, duration: 3, inPoint: 5, speed: 1 });
  const slipped = slipEdit(clip, 2);
  assert.equal(slipped.start, 10);
  assert.equal(slipped.duration, 3);
  assert.equal(slipped.inPoint, 7);
});

test("slideEdit moves a clip and adjusts neighbouring edit points", () => {
  const previous = baseClip({ id: "prev", start: 0, duration: 8 });
  const clip = baseClip({ id: "c", start: 4, duration: 3 });
  const next = baseClip({ id: "next", start: 7, duration: 6 });
  const moved = slideEdit(previous, clip, next, 6);
  assert.equal(moved[1].start, 6);
  assert.equal(moved[0].duration, 6);
  assert.equal(moved[2].start, 9);
});

test("rollEdit moves the cut boundary while preserving total span", () => {
  const previous = baseClip({ id: "prev", start: 0, duration: 4 });
  const next = baseClip({ id: "next", start: 4, duration: 4, inPoint: 2 });
  const [p, n] = rollEdit(previous, next, 5);
  assert.equal(p.duration, 5);
  assert.equal(n.start, 5);
  assert.equal(n.duration, 3);
  assert.equal(n.inPoint, 3); // source advanced by delta * speed
  assert.equal(clipEnd(n), 8);
});

test("groupClips and ungroupClips manage group membership", () => {
  const a = baseClip({ id: "a" });
  const b = baseClip({ id: "b" });
  const grouped = groupClips([a, b]);
  const groupId = grouped[0].groupId;
  assert.ok(groupId);
  assert.equal(grouped[0].groupId, grouped[1].groupId);
  const ungrouped = ungroupClips(grouped);
  assert.ok(ungrouped.every((clip) => !clip.groupId));
});

test("staticPropertyValue returns static value or keyframe midpoint base", () => {
  const clip = baseClip({ scale: 120 });
  assert.equal(staticPropertyValue(clip, "scale"), 120);
  assert.equal(staticPropertyValue(baseClip(), "positionX"), 0);
});
