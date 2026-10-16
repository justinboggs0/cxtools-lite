// Builds page elements. Text is always added as text, never parsed as HTML.

/**
 * Creates an element.
 * @param {string} tag
 * @param {Object<string, *>} [attrs] 'class' sets className; 'onxxx' adds an event listener; true sets an empty
 *   attribute; false, null and undefined are skipped; anything else becomes an attribute
 * @param {...(Node|string|number|null|Array)} children nested arrays are flattened; null is skipped; other values
 *   become text nodes
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
