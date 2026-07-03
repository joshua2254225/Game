/* =========================================================
FILE 16: js/utils/dom.js

This file contains small DOM helper functions.

Purpose:

- Reduce repeated document-query boilerplate
- Make DOM access safer and easier to read
- Provide reusable helpers for UI, menus, overlays, and input
- Keep browser-specific code out of gameplay logic

This file is utility-only.
It should not contain game rules or state logic.
========================================================= */

/* ---------------------------------------------------------
ELEMENT LOOKUP
--------------------------------------------------------- */

/**

* Get a single element by ID.
* Returns null if the element does not exist.
  */
  function byId(id, root = document) {
  if (!root || typeof root.getElementById !== "function") {
  return null;
  }

return root.getElementById(id);
}

/**

* Query a single element.
  */
  function query(selector, root = document) {
  if (!root || typeof root.querySelector !== "function") {
  return null;
  }

return root.querySelector(selector);
}

/**

* Query multiple elements and return a real array.
  */
  function queryAll(selector, root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
  return [];
  }

return Array.from(root.querySelectorAll(selector));
}

/**

* Return all elements matching an array of selectors.
* Useful when several different selectors may point to the same UI block.
  */
  function queryAny(selectors, root = document) {
  if (!Array.isArray(selectors)) return [];

const results = [];
for (const selector of selectors) {
const found = query(selector, root);
if (found) results.push(found);
}

return results;
}

/* ---------------------------------------------------------
ELEMENT STATE HELPERS
--------------------------------------------------------- */

/**

* Show an element by removing the hidden state.
  */
  function show(element) {
  if (!element) return false;
  element.hidden = false;
  element.style.display = "";
  return true;
  }

/**

* Hide an element by setting hidden.
  */
  function hide(element) {
  if (!element) return false;
  element.hidden = true;
  return true;
  }

/**

* Toggle an element's visibility.
  */
  function toggle(element, force) {
  if (!element) return false;

const next = typeof force === "boolean" ? force : element.hidden;
element.hidden = !next;
return next;
}

/**

* Add a CSS class if the element exists.
  */
  function addClass(element, className) {
  if (!element || !className) return false;
  element.classList.add(className);
  return true;
  }

/**

* Remove a CSS class if the element exists.
  */
  function removeClass(element, className) {
  if (!element || !className) return false;
  element.classList.remove(className);
  return true;
  }

/**

* Toggle a CSS class if the element exists.
  */
  function toggleClass(element, className, force) {
  if (!element || !className) return false;
  return element.classList.toggle(className, force);
  }

/* ---------------------------------------------------------
CONTENT HELPERS
--------------------------------------------------------- */

/**

* Set text content safely.
  */
  function setText(element, text) {
  if (!element) return false;
  element.textContent = text == null ? "" : String(text);
  return true;
  }

/**

* Set HTML content safely.
* Use only when the content is trusted.
  */
  function setHTML(element, html) {
  if (!element) return false;
  element.innerHTML = html == null ? "" : String(html);
  return true;
  }

/**

* Set an attribute safely.
  */
  function setAttr(element, name, value) {
  if (!element || !name) return false;
  element.setAttribute(name, String(value));
  return true;
  }

/**

* Remove an attribute safely.
  */
  function removeAttr(element, name) {
  if (!element || !name) return false;
  element.removeAttribute(name);
  return true;
  }

/**

* Read an attribute safely.
  */
  function getAttr(element, name, defaultValue = null) {
  if (!element || !name || typeof element.getAttribute !== "function") {
  return defaultValue;
  }

const value = element.getAttribute(name);
return value === null ? defaultValue : value;
}

/* ---------------------------------------------------------
EVENT HELPERS
--------------------------------------------------------- */

/**

* Attach an event listener and return a cleanup function.
* This is helpful for keeping track of bindings in one place.
  */
  function on(element, eventName, handler, options) {
  if (!element || typeof element.addEventListener !== "function") {
  return () => {};
  }

element.addEventListener(eventName, handler, options);

return () => {
element.removeEventListener(eventName, handler, options);
};
}

/**

* Attach multiple event listeners to one element.
* Returns a cleanup function for all bindings.
  */
  function onMany(element, bindings = []) {
  if (!element || !Array.isArray(bindings)) {
  return () => {};
  }

const cleanups = [];

for (const binding of bindings) {
if (!binding || typeof binding !== "object") continue;

const { eventName, handler, options } = binding;
if (!eventName || typeof handler !== "function") continue;

cleanups.push(on(element, eventName, handler, options));

}

return () => {
for (const cleanup of cleanups) cleanup();
};
}

/**

* Remove all children from an element.
  */
  function clearChildren(element) {
  if (!element) return false;

while (element.firstChild) {
element.removeChild(element.firstChild);
}

return true;
}

/**

* Create an element with optional class name, text, and attributes.
  */
  function createElement(tagName, options = {}) {
  if (!tagName) return null;

const el = document.createElement(tagName);

if (options.className) {
el.className = options.className;
}

if (options.text != null) {
el.textContent = String(options.text);
}

if (options.html != null) {
el.innerHTML = String(options.html);
}

if (options.attrs && typeof options.attrs === "object") {
for (const [key, value] of Object.entries(options.attrs)) {
el.setAttribute(key, String(value));
}
}

return el;
}

/* ---------------------------------------------------------
STYLE HELPERS
--------------------------------------------------------- */

/**

* Set one or more inline style properties.
  */
  function setStyles(element, styles = {}) {
  if (!element || !styles || typeof styles !== "object") return false;

for (const [key, value] of Object.entries(styles)) {
element.style[key] = String(value);
}

return true;
}

/**

* Get the computed style value for a property.
  */
  function getStyle(element, propertyName, defaultValue = "") {
  if (!element || typeof window === "undefined") return defaultValue;

const styles = window.getComputedStyle(element);
return styles.getPropertyValue(propertyName) || defaultValue;
}

/* ---------------------------------------------------------
SCROLL / VIEW HELPERS
--------------------------------------------------------- */

/**

* Check whether an element is visible in the viewport.
  */
  function isInViewport(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
  return false;
  }

const rect = element.getBoundingClientRect();
return (
rect.bottom > 0 &&
rect.right > 0 &&
rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
rect.left < (window.innerWidth || document.documentElement.clientWidth)
);
}

/**

* Scroll an element into view if supported.
  */
  function scrollIntoView(element, options = { block: "center", inline: "nearest" }) {
  if (!element || typeof element.scrollIntoView !== "function") return false;
  element.scrollIntoView(options);
  return true;
  }

/* ---------------------------------------------------------
FOCUS HELPERS
--------------------------------------------------------- */

/**

* Focus an element safely.
  */
  function focusElement(element) {
  if (!element || typeof element.focus !== "function") return false;
  element.focus();
  return true;
  }

/**

* Blur an element safely.
  */
  function blurElement(element) {
  if (!element || typeof element.blur !== "function") return false;
  element.blur();
  return true;
  }

/* ---------------------------------------------------------
EXPORTS
--------------------------------------------------------- */

export {
byId,
query,
queryAll,
queryAny,
show,
hide,
toggle,
addClass,
removeClass,
toggleClass,
setText,
setHTML,
setAttr,
removeAttr,
getAttr,
on,
onMany,
clearChildren,
createElement,
setStyles,
getStyle,
isInViewport,
scrollIntoView,
focusElement,
blurElement
};

export default {
byId,
query,
queryAll,
queryAny,
show,
hide,
toggle,
addClass,
removeClass,
toggleClass,
setText,
setHTML,
setAttr,
removeAttr,
getAttr,
on,
onMany,
clearChildren,
createElement,
setStyles,
getStyle,
isInViewport,
scrollIntoView,
focusElement,
blurElement
};
