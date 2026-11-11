import assert from "node:assert/strict";
import test from "node:test";
import {
  ANIMATABLE_PROPERTIES,
  animatedClipSettings,
  audioGainAt,
  evaluateProperty,
  keyframesForProperty,
  rollEdit,
  slipEdit,
  setKeyframeValue,
  staticPropertyValue,
  formatTime,
  addKeyframeToClip,
  removeKeyframeFromClip,
  clearKeyframesFromClip,
  MARKER_COLORS,
} from "../src/types.ts";

const clip = {
  id: "clip-1",
  track: "video",
  name: "Clip",
  start: 0,
  inPoint: 0,
  duration: 4,
  speed: 1,
  volume: 0.8,
  muted: false,
  positionX: 10,
  positionY: -20,
  scale: 120,
  opacity: 80,
};

test("static property values expose every animatable property", () => {
  assert.equal(staticPropertyValue(clip, "positionX"), 10);
  assert.equal(staticPropertyValue(clip, "positionY"), -20);
  assert.equal(staticPropertyValue(clip, "scale"), 120);
  assert.equal(staticPropertyValue(clip, "rotation"), 0);
  assert.equal(staticPropertyValue(clip, "opacity"), 80);
  assert.equal(staticPropertyValue(clip, "volume"), 80); // 0–1 volume × 100
  assert.equal(ANIMATABLE_PROPERTIES.length, 6);
});

test("keyframes are stored sorted by time and evaluated with easing", () => {
  let animated = clip;
  // setKeyframeValue clamps times into the clip (duration 4) and takes absolute time
  animated = setKeyframeValue(animated, "scale", 1, 100, "linear");
  animated = setKeyframeValue(animated, "scale", 3, 200, "linear");
  const frames = keyframesForProperty(animated, "scale");
  assert.deepEqual(
    frames.map((frame) => frame.time),
    [1, 3],
  );
  // before the first frame clamps to the first value; midpoint is linear (150)
  assert.equal(evaluateProperty(animated, "scale", 0.5), 100);
  assert.equal(evaluateProperty(animated, "scale", 2), 150);
  assert.equal(evaluateProperty(animated, "scale", 3.5), 200);
  // Animation preview and export share the same evaluation.
  const preview = animatedClipSettings(animated, 2);
  assert.equal(preview.scale, 150);
  assert.equal(animatedClipSettings(animated, 9).scale, 200);
});

test("easing types change interpolation between two keyframes", () => {
  let animated = clip;
  animated = setKeyframeValue(animated, "opacity", 1, 0, "linear");
  animated = setKeyframeValue(animated, "opacity", 3, 100, "ease-in");
  const easeIn = animatedClipSettings(animated, 2).opacity;
  assert.ok(easeIn < 50, `ease-in at 50% should be below 50, got ${easeIn}`);
  assert.ok(animatedClipSettings(animated, 2.9).opacity > 90);
});

test("audio gain respects keyframed volume plus fades", () => {
  const animated = {
    ...clip,
    start: 0,
    duration: 4,
    fadeIn: 1,
    fadeOut: 1,
    volume: 1,
    muted: false,
  };
  assert.equal(audioGainAt(animated, 0), 0);
  assert.ok(audioGainAt(animated, 0.5) > 0 && audioGainAt(animated, 0.5) < 1);
  assert.equal(audioGainAt(animated, 1.5), 1);
  assert.equal(audioGainAt(animated, 3), 1);
  assert.ok(audioGainAt(animated, 3.5) > 0 && audioGainAt(animated, 3.5) < 1);
  assert.equal(audioGainAt(animated, 4), 0);
  assert.equal(audioGainAt({ ...animated, muted: true }, 2), 0);
  // keyframed volume multiplies with the clip volume
  const keyed = setKeyframeValue(
    { ...animated, fadeIn: 0, fadeOut: 0, volume: 0.5 },
    "volume",
    2,
    100,
  );
  assert.equal(audioGainAt(keyed, 2), 0.5);
});

test("roll edit moves the shared cut point while keeping the pair span and source integrity", () => {
  const previous = {
    ...clip,
    id: "prev",
    start: 0,
    duration: 2,
    inPoint: 5,
    speed: 1,
  };
  const next = { ...clip, id: "next", start: 2, duration: 4, inPoint: 1 };
  const [newPrev, newNext] = rollEdit(previous, next, 1.5);
  assert.equal(newPrev.duration, 1.5);
  assert.equal(newNext.start, 1.5);
  assert.equal(newNext.duration, 4.5);
  // rolling left rewinds the incoming clip's source by delta * speed
  assert.equal(newNext.inPoint, 0.5);
  // rolling right advances the incoming clip's source
  const rolledRight = rollEdit(previous, next, 2.5);
  assert.equal(rolledRight[1].inPoint, 1.5);
  const clamped = rollEdit(previous, next, 0);
  assert.equal(clamped[0].duration, 0.1);
  assert.equal(clamped[1].start, 0.1);
});

test("slip edit keeps the clip in place while changing its source section", () => {
  const slipped = slipEdit({ ...clip, inPoint: 3 }, 2);
  assert.equal(slipped.start, clip.start);
  assert.equal(slipped.duration, clip.duration);
  assert.equal(slipped.inPoint, 5);
});

test("add, remove, and clear keyframes maintain sorted order and defaults", () => {
  let animated = addKeyframeToClip(clip, "positionX", 3.5, 42);
  assert.equal(keyframesForProperty(animated, "positionX").length, 1);
  const frame = keyframesForProperty(animated, "positionX")[0];
  assert.equal(frame.value, 42);
  animated = removeKeyframeFromClip(animated, "positionX", frame.id);
  assert.equal(keyframesForProperty(animated, "positionX").length, 0);
  animated = clearKeyframesFromClip(animated, "scale");
  assert.ok(!animated.keyframes?.properties.scale);
});

test("timecode formatting is frame accurate for project fps", () => {
  assert.equal(formatTime(65.5, 30), "01:05:15");
  assert.equal(formatTime(65.5, 60), "01:05:30");
  assert.equal(formatTime(0, 30), "00:00:00");
  assert.equal(formatTime(1.97, 30), "00:01:29");
});

test("marker colors are provided for timeline color coding", () => {
  assert.ok(MARKER_COLORS.length >= 5);
  for (const color of MARKER_COLORS) assert.match(color, /^#[0-9a-f]{6}$/i);
});
