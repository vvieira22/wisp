"use strict";

const PET = { w: 148, h: 176, spriteW: 124, spriteH: 148 };
const GAP = 8;
// w/h/lift/padX/gap must match #bubble and #stage in pet.css
const BUBBLE = { w: 280, h: 96, gap: 10, padX: 12, lift: 32 };

function petWindowSize(visible) {
  if (!visible) return { width: PET.w, height: PET.h };
  return {
    width: PET.spriteW + BUBBLE.padX * 2 + BUBBLE.gap + BUBBLE.w,
    height: Math.max(PET.h, BUBBLE.h + BUBBLE.lift),
  };
}

function spriteRect(pet, size = PET) {
  const boxX = pet.x + pet.width - size.w;
  const boxY = pet.y + pet.height - size.h;
  const padX = (size.w - size.spriteW) / 2;
  return {
    x: boxX + padX,
    y: boxY + size.h - size.spriteH,
    w: size.spriteW,
    h: size.spriteH,
  };
}

function clamp(n, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, n));
}

function clampToArea(rect, area) {
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  return {
    x: clamp(rect.x, area.x, area.x + area.width - width),
    y: clamp(rect.y, area.y, area.y + area.height - height),
    width,
    height,
  };
}

function overflow(area, x, y, w, h) {
  return (
    Math.max(0, area.x - x) +
    Math.max(0, area.y - y) +
    Math.max(0, x + w - (area.x + area.width)) +
    Math.max(0, y + h - (area.y + area.height))
  );
}

function dockChat({ ghost, chat, area, gap = GAP }) {
  const preferLeft = ghost.x + ghost.w / 2 >= area.x + area.width / 2;
  const preferTop = ghost.y + ghost.h / 2 >= area.y + area.height / 2;
  const alignY = preferTop ? "end" : "start";
  const alignX = preferLeft ? "end" : "start";
  const yBeside = preferTop ? ghost.y + ghost.h - chat.h : ghost.y;
  const xStack = preferLeft ? ghost.x + ghost.w - chat.w : ghost.x;
  const opts = [
    { side: "left", align: alignY, x: ghost.x - gap - chat.w, y: yBeside, rank: preferLeft ? 0 : 1 },
    { side: "right", align: alignY, x: ghost.x + ghost.w + gap, y: yBeside, rank: preferLeft ? 1 : 0 },
    { side: "top", align: alignX, x: xStack, y: ghost.y - gap - chat.h, rank: preferTop ? 2 : 3 },
    { side: "bottom", align: alignX, x: xStack, y: ghost.y + ghost.h + gap, rank: preferTop ? 3 : 2 },
  ];
  for (const opt of opts) opt.overflow = overflow(area, opt.x, opt.y, chat.w, chat.h);
  opts.sort((a, b) => a.overflow - b.overflow || a.rank - b.rank);
  const best = opts[0];
  return {
    x: clamp(best.x, area.x, area.x + area.width - chat.w),
    y: clamp(best.y, area.y, area.y + area.height - chat.h),
    side: best.side,
    align: best.align,
  };
}

module.exports = { PET, GAP, BUBBLE, spriteRect, dockChat, clampToArea, petWindowSize };
