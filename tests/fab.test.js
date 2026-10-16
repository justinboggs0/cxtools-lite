import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPosition, mountFab } from '../src/ui/fab.js';

test('a position saved on a wide screen is pulled back onto a narrow one', () => {
  assert.deepEqual(clampPosition({ x: 5000, y: -10 }, { width: 120, height: 40 }, { vw: 800, vh: 600 }), { x: 680, y: 0 });
  assert.deepEqual(clampPosition({ x: -30, y: 900 }, { width: 120, height: 40 }, { vw: 800, vh: 600 }), { x: 0, y: 560 });
  assert.deepEqual(clampPosition({ x: 100, y: 200 }, { width: 120, height: 40 }, { vw: 800, vh: 600 }), { x: 100, y: 200 });
});

test('a viewport smaller than the button pins it to the top-left corner; junk positions become 0', () => {
  assert.deepEqual(clampPosition({ x: 50, y: 50 }, { width: 120, height: 40 }, { vw: 100, vh: 30 }), { x: 0, y: 0 });
  assert.deepEqual(clampPosition({ x: NaN, y: undefined }, { width: 120, height: 40 }, { vw: 800, vh: 600 }), { x: 0, y: 0 });
});

// A document just big enough for mountFab: h() builds elements with the global document.
function fakeDocument(appended) {
  const el = () => ({
    attrs: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = v; }, append() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 40 }),
  });
  return { createElement: el, createTextNode: t => ({ t }), body: { contains: () => false, append: (...n) => appended.push(...n) } };
}

test('sync labels the button for the list and for one inspection, and hides it elsewhere', () => {
  const appended = [];
  const previous = globalThis.document;
  globalThis.document = fakeDocument(appended);
  globalThis.Node = class {};
  try {
    const win = { innerWidth: 1200, innerHeight: 800, addEventListener() {}, setTimeout, clearTimeout };
    const saved = [];
    const fab = mountFab({ doc: globalThis.document, win, onOpen() {}, initial: null, savePosition: v => saved.push(v) });
    assert.equal(fab.el.attrs.id, 'cxl-fab');
    fab.sync({ page: 'inspections', companyId: '1', projectId: '2', inspectionId: null });
    assert.equal(fab.el.hidden, false);
    assert.equal(fab.el.textContent, 'CxTools Lite: equipment list');
    fab.sync({ page: 'inspection', companyId: '1', projectId: '2', inspectionId: '9' });
    assert.equal(fab.el.textContent, 'CxTools Lite: this inspection');
    fab.sync(null);
    assert.equal(fab.el.hidden, true);
    assert.ok(appended.includes(fab.el));
    fab.reset();
    assert.deepEqual(saved, [null]);
  } finally {
    globalThis.document = previous;
  }
});
