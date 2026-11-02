// The local copy of the pinned asset. The client serves it for the pinned URL in config.json.
// It colours the test box, so a render shows that the pinned asset ran.
(function () {
  var box = document.getElementById("box");
  box.style.background = "#00aa00";
  window.__t4.pinnedRan = true;
  window.mark("pinnedRan");
})();
