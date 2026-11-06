# Roadmap

This file lists the work that is planned and not started. The status of each released input type is in the [README](../README.md#roadmap). The [build plan](superpowers/plans/2026-11-01-scieng-engine-build.md) gives the order of the increments that are done.

## Planned

### Viewer reload

The HTML viewer of a `cad` document or a STEP, IGES or BREP file loads the model again when the model is rendered again. The user edits the model, renders it, and sees the change in the open page.

- A page that opens from disk cannot see a change to its file. The design must choose how the page gets the change.
- One option is a local watch tool. The tool listens on `127.0.0.1` only, watches one file, renders it again on a change, and tells the page to reload.
- That option touches the network rule of the engine. The design records the choice first, in its own commit.
- The engine package does not change for this item. The tool is for development.

### Hidden and interior edges in the cad drawing

The `pdf` drawing of a `cad` document shows the outline of each view only. A blind hole, a pocket or a step inside the outline is not visible. A later increment can add the visible interior edges and the hidden edges as dashed lines.

### Turned models with a notch in the design-for-manufacture report

The wall check of the `md` report can show a false thin region on a model with a notch that is turned off the axes. A later increment can remove this false result without a loss of detection.
