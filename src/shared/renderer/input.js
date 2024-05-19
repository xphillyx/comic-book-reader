/**
 * @license
 * Copyright 2024 Álvaro García
 * www.binarynonsense.com
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { getOpenModal } from "../../core/renderer.js";
import { getTools, getCurrentTool, getCurrentToolName } from "./tools.js";
import * as modals from "./modals.js";
import { init as setupGamepads } from "./gamepads.js";

export function init() {
  initKeyboard();
  initMouse();
  initTouchScreen();
  initGamepads();
}

///////////////////////////////////////////////////////////////////////////////
// DRAG & DROP  ///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

document.ondragover = document.ondrop = (event) => {
  event.preventDefault();
};

document.body.ondrop = (event) => {
  if (getOpenModal()) return;
  if (getCurrentToolName() === "reader") {
    if (!getTools()["audio-player"].onInputEvent("body.ondrop", event)) {
      getTools()["reader"].onInputEvent("body.ondrop", event);
    }
  } else {
    getCurrentTool().onInputEvent("body.ondrop", event);
  }
  event.preventDefault();
};

///////////////////////////////////////////////////////////////////////////////
// KEYBOARD ///////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function initKeyboard() {
  document.onkeydown = function (event) {
    if (getOpenModal()) {
      modals.onInputEvent(getOpenModal(), "onkeydown", event);
      return;
    }
    getCurrentTool().onInputEvent("onkeydown", event);
  };
}

///////////////////////////////////////////////////////////////////////////////
// MOUSE //////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_isMouseDown = false;
let g_mouseLastX, g_mouseLastY;
let g_mouseMovedX, g_mouseMovedY;
let g_mouseDownTime;

function initMouse() {
  document.addEventListener("mousedown", function (event) {
    g_isMouseDown = true;
    g_mouseLastX = event.pageX;
    g_mouseLastY = event.pageY;
    g_mouseMovedX = 0;
    g_mouseMovedY = 0;
    g_mouseDownTime = Date.now();
  });

  document.addEventListener("mousemove", function (event) {
    if (!getOpenModal()) {
      getCurrentTool().onInputEvent("mousemove");
    }
    if (g_isMouseDown) {
      const mouseDeltaX = event.pageX - g_mouseLastX;
      const mouseDeltaY = event.pageY - g_mouseLastY;
      if (!getOpenModal()) {
        getCurrentTool().onInputEvent("acbr-onmousedownmove", [
          mouseDeltaX,
          mouseDeltaY,
        ]);
      }
      g_mouseLastX = event.pageX;
      g_mouseLastY = event.pageY;
      g_mouseMovedX += Math.abs(mouseDeltaX);
      g_mouseMovedY += Math.abs(mouseDeltaY);
    }
  });

  document.addEventListener("mouseup", function (event) {
    g_isMouseDown = false;
  });

  //dblclick
  //mouseleave

  document.addEventListener("click", function (event) {
    if (getOpenModal()) return;
    getCurrentTool().onInputEvent("click", event);
    // TODO: make margin a percentage of the window height?
    const margin = 10;
    const deltaTime = Date.now() - g_mouseDownTime;
    const wasDrag =
      (deltaTime > 1500 && (g_mouseMovedX > 0 || g_mouseMovedY > 0)) ||
      (deltaTime > 500 && (g_mouseMovedX > margin || g_mouseMovedY > margin));
    if (!wasDrag && event.pointerType === "mouse") {
      getCurrentTool().onInputEvent("acbr-click", {
        event: event,
        target: event.target,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }
  });

  document.addEventListener("wheel", function (event) {
    if (getOpenModal()) return;
    getCurrentTool().onInputEvent("wheel", event);
    event.stopPropagation();
    //event.preventDefault();
  });
}
///////////////////////////////////////////////////////////////////////////////
// TOUCHSCREEN ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_isTouching = false;
let g_touchLastX, g_touchLastY;
let g_touchMovedX, g_touchMovedY;
let g_touchTime;
let g_touches = [],
  g_prevTouches = [];
let g_touchClickTimer = null;
let g_lastTouchEndTime = 0;

function initTouchScreen() {
  document.addEventListener("touchstart", function (event) {
    // console.log("touchstart");
    g_isTouching = true;
    g_touches = g_prevTouches = event.touches; // event.targetTouches;
    g_touchLastX = g_touches[0].clientX;
    g_touchLastY = g_touches[0].clientY;
    g_touchMovedX = 0;
    g_touchMovedY = 0;
    g_touchTime = Date.now();
  });

  document.addEventListener(
    "touchmove",
    function (event) {
      console.log("touchmove");
      g_isTouching = true;
      g_prevTouches = g_touches;
      g_touches = event.touches;

      if (g_touches.length === 1) {
        // drag to scroll
        // NOTE: used mouse code as reference to do it mostly the same way
        const touchDeltaX = g_touches[0].clientX - g_touchLastX;
        const touchDeltaY = g_touches[0].clientY - g_touchLastY;
        if (!getOpenModal()) {
          getCurrentTool().onInputEvent("acbr-onmousedownmove", [
            touchDeltaX,
            touchDeltaY,
          ]);
        }
        g_touchLastX = g_touches[0].clientX;
        g_touchLastY = g_touches[0].clientY;
        g_touchMovedX += Math.abs(touchDeltaX);
        g_touchMovedY += Math.abs(touchDeltaY);
        // NOTE: work in progress
        // TODO: delete false to continue working on this
      } else if (false && g_touches.length === 2) {
        // pinch-zoom
        // NOTE: added user-scalable:none to index-X.html files to prevent the
        // default pinch zoom
        console.log("pinch-zoom");
        console.log(g_touches);
        let a = g_touches[0].clientX - g_touches[1].clientX;
        let b = g_touches[0].clientY - g_touches[1].clientY;
        const touchesDistance = Math.sqrt(a * a + b * b);
        a = g_prevTouches[0].clientX - g_prevTouches[1].clientX;
        b = g_prevTouches[0].clientY - g_prevTouches[1].clientY;
        const prevTouchesDistance = Math.sqrt(a * a + b * b);
        if (touchesDistance > 0) {
          console.log(touchesDistance);
          // NOTE: still doesn't work, sometimes the pich is detected
          // and others not???
          // Also need to implement the zoom call correctly with good values
          // maybe use a timer and zoom at a constant rate?
          // TODO: comment the onInputEvent call to see if scaling is the
          // cause of only detecting touchmove events once some times...
          // I'm having trouble testing this as my PC doesn't have a touch
          // screen, and going back and forth to my steamdeck with the build
          // is time consuming and can't easily debug things
          if (touchesDistance > prevTouchesDistance) {
            if (!getOpenModal()) {
              getCurrentTool().onInputEvent("acbr-pinchzoom", { zoom: 1 });
            }
          } else if (touchesDistance < prevTouchesDistance) {
            if (!getOpenModal()) {
              getCurrentTool().onInputEvent("acbr-pinchzoom", { zoom: -1 });
            }
          }
        }
      }
      // prevent default drag-scroll
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { passive: false }
  );

  document.addEventListener("touchend", function (event) {
    // console.log("touchend");
    g_isTouching = false;
    if (g_touches.length === 1) {
      const currentTime = Date.now();
      const deltaTime = currentTime - g_lastTouchEndTime;
      g_lastTouchEndTime = currentTime;
      if (!getOpenModal()) {
        if (deltaTime < 500) {
          console.log("Double tapped!");
          if (g_touchClickTimer) {
            clearTimeout(g_touchClickTimer);
            console.log("clear timer");
          }
        } else {
          g_touchClickTimer = setTimeout(() => {
            // trying to make more or less the same as in mouse "click"
            // TODO: should I pass the data as parameters and not just use
            // the globals? seems to work fine but couldn't they be outdated
            // when the function is actually called doing it this way?
            const margin = 10;
            const deltaTime = Date.now() - g_touchTime;
            const wasDrag =
              (deltaTime > 1500 && (g_touchMovedX > 0 || g_touchMovedY > 0)) ||
              (deltaTime > 500 &&
                (g_touchMovedX > margin || g_touchMovedY > margin));
            if (!wasDrag) {
              getCurrentTool().onInputEvent("acbr-click", {
                event: event,
                target: g_touches[0].target,
                clientX: g_touches[0].clientX,
                clientY: g_touches[0].clientY,
              });
            }
          }, 500);
        }
      }
    }
  });
}

///////////////////////////////////////////////////////////////////////////////
// GAMEPADS ///////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function initGamepads() {
  setupGamepads(() => {
    if (getOpenModal()) {
      modals.onGamepadPolled(getOpenModal());
      return;
    }
    if (getCurrentTool().onGamepadPolled) {
      getCurrentTool().onGamepadPolled();
    }
  });
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// refs:
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
// https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// TODO: unused code, delete when no longer needed as reference
// const g_pointerEventCache = [];
// let g_prevPointersDistance = 0;

// document.addEventListener("pointerdown", function (event) {
//   if (event.pointerType === "touch") {
//     // add to cache
//     g_pointerEventCache.push(event);
//   }
// });

// document.addEventListener("pointermove", function (event) {
//   if (event.pointerType === "touch") {
//     // update in cache
//     const index = g_pointerEventCache.findIndex(
//       (cachedEv) => cachedEv.pointerId === event.pointerId
//     );
//     g_pointerEventCache[index] = event;

//     if (g_pointerEventCache.length === 2) {
//       // 2 pointers -> check pinch-zoom
//       const a =
//         g_pointerEventCache[0].clientX - g_pointerEventCache[1].clientX;
//       const b =
//         g_pointerEventCache[0].clientY - g_pointerEventCache[1].clientY;
//       const pointerDistance = Math.sqrt(a * a + b * b);
//       if (g_prevPointersDistance > 0) {
//         console.log(g_prevPointersDistance);
//         if (pointerDistance > g_prevPointersDistance) {
//           if (getOpenModal()) return;
//           getCurrentTool().onInputEvent("acbr-pinchzoom", { zoom: 1 });
//         }
//         if (pointerDistance < g_prevPointersDistance) {
//           if (getOpenModal()) return;
//           getCurrentTool().onInputEvent("acbr-pinchzoom", { zoom: -1 });
//         }
//       }
//       g_prevPointersDistance = pointerDistance;
//     }
//   }
// });
// // ref: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures

// document.addEventListener("pointerup", function (event) {
//   if (event.pointerType === "touch") {
//     // remove from cache
//     const index = g_pointerEventCache.findIndex(
//       (cachedEv) => cachedEv.pointerId === event.pointerId
//     );
//     g_pointerEventCache.splice(index, 1);

//     if (g_pointerEventCache.length < 2) {
//       g_prevPointersDistance = 0;
//     }
//   }
// });
