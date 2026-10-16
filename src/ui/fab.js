// The orange button. It shows on Inspections pages, can be dragged anywhere, shrinks to a small tab on a
// press-and-hold, and remembers where it was left.

import { h } from './dom.js';

const HOLD_MS = 600;
// Movement below this many pixels is a click, not a drag.
const DRAG_THRESHOLD_PX = 4;

/**
 * Pulls a top-left position back inside the viewport so the whole button stays reachable.
 * @param {{x: number, y: number}} pos wanted top-left, in CSS pixels
 * @param {{width: number, height: number}} size the button's size
 * @param {{vw: number, vh: number}} viewport the window's inner size
 * @returns {{x: number, y: number}} a position with the button fully visible (top-left corner when it can't fit)
 */
export function clampPosition({ x, y }, { width, height }, { vw, vh }) {
  const clamp = (v, max) => Math.min(Math.max(0, Number.isFinite(v) ? v : 0), Math.max(0, max));
  return { x: clamp(x, vw - width), y: clamp(y, vh - height) };
}

/**
 * Creates the button (hidden until `sync` gets a route).
 * @param {{doc: Document, win: Window, onOpen: function(): void, initial: {x: number, y: number, collapsed?: boolean}|null,
 *   savePosition: function({x: number|null, y: number|null, collapsed: boolean}|null): void}} options
 * @returns {{el: HTMLButtonElement, sync: function(object|null): void, reset: function(): void}}
 *   sync(route) shows, hides and labels the button; reset() puts it back in the default corner
 */
export function mountFab({ doc, win, onOpen, initial, savePosition }) {
  let collapsed = !!initial?.collapsed;
  let position = initial && Number.isFinite(initial.x) ? { x: initial.x, y: initial.y } : null;
  let route = null;
  const el = h('button', { id: 'cxl-fab', hidden: true, type: 'button', title: 'Drag to move. Press and hold to shrink.' });

  const label = () => {
    if (collapsed) return '⬇';
    return route?.page === 'inspection' ? 'CxTools Lite: this inspection' : 'CxTools Lite: equipment list';
  };
  const place = () => {
    if (!position) {
      // Default corner from the stylesheet.
      el.style.left = el.style.top = '';
      el.style.right = el.style.bottom = '';
      return;
    }
    const rect = el.getBoundingClientRect();
    const p = clampPosition(position, { width: rect.width || 120, height: rect.height || 40 }, { vw: win.innerWidth, vh: win.innerHeight });
    Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, right: 'auto', bottom: 'auto' });
  };
  // Saved as {x, y, collapsed}; x and y are null while the button sits in its default corner.
  const persist = () => {
    try {
      savePosition(position || collapsed ? { x: position?.x ?? null, y: position?.y ?? null, collapsed } : null);
    } catch (e) {
      console.warn('CxTools Lite: could not save the button position', e);
    }
  };

  const setCollapsed = value => {
    collapsed = !!value;
    el.classList.toggle('cxl-collapsed', collapsed);
    el.textContent = label();
    place();
  };

  // A press that moves is a drag; a press held without moving shrinks or restores the button; anything else is
  // a click. The click that follows a drag or a hold is ignored.
  let press = null;
  let swallowClick = false;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const rect = el.getBoundingClientRect();
    press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top, dragging: false, held: false };
    press.timer = win.setTimeout(() => {
      if (!press || press.dragging) return;
      press.held = true;
      setCollapsed(!collapsed);
      persist();
    }, HOLD_MS);
    try { el.setPointerCapture(e.pointerId); } catch { /* not needed for the drag to work */ }
  });
  el.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.sx;
    const dy = e.clientY - press.sy;
    if (!press.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!press.dragging) {
      press.dragging = true;
      win.clearTimeout(press.timer);
      el.classList.add('cxl-dragging');
    }
    position = { x: press.ox + dx, y: press.oy + dy };
    place();
  });
  const endPress = e => {
    if (!press || (e && e.pointerId !== press.id)) return;
    win.clearTimeout(press.timer);
    el.classList.remove('cxl-dragging');
    if (press.dragging) {
      // Save where the button actually ended up.
      const rect = el.getBoundingClientRect();
      position = { x: rect.left, y: rect.top };
      persist();
    }
    swallowClick = press.dragging || press.held;
    press = null;
  };
  el.addEventListener('pointerup', endPress);
  el.addEventListener('pointercancel', endPress);
  el.addEventListener('click', () => {
    if (swallowClick) { swallowClick = false; return; }
    onOpen();
  });
  // Keep the button on screen when the window gets smaller.
  win.addEventListener('resize', place);

  const sync = r => {
    route = r;
    // Procore can replace the page's content; put the button back if it was removed.
    if (!doc.body.contains(el)) doc.body.append(el);
    el.hidden = !r;
    el.textContent = label();
    place();
  };
  const reset = () => {
    position = null;
    collapsed = false;
    el.classList.remove('cxl-collapsed');
    el.textContent = label();
    place();
    persist();
  };
  setCollapsed(collapsed);
  return { el, sync, reset };
}
