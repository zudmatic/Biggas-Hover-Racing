// Compare against the actual DOM so action handlers can still write between
// frames. Unchanged strings must not create mutations or replace text nodes.
export function setData(element,key,value){value=String(value);if(element.dataset[key]!==value)element.dataset[key]=value;}
export function setText(element,value){if(element.textContent!==value)element.textContent=value;}
export function setStyle(element,key,value){if(element.style[key]!==value)element.style[key]=value;}
