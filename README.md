# Drawing Board

Select **Marker**, **Highlighter**, or **Eraser** in the bottom toolbar.
Select **Text** to be able to type somethinng in. 
Click **Math** to insert math symbols 

Math includes Σ, σ, √, π, θ, ∞, ∫, ±, ², ³, ≤, and ≥. These are editable
text symbols and cant calculate anything (yet). Escape cancels a symbol waiting to
be placed.

Click **Shapes** to choose Line, Rectangle, or Circle from the menu above it.
Undo, Redo, and Clear All are in the top bar.

Use **−** and **+** at the bottom left of the drawing area to zoom from 25% to
400%. Click the percentage to reset to 100% and return to the top left.
Zooming keeps the center of your view in place. Use the **hand** button to drag
around a zoomed drawing with a mouse, finger, or stylus; click it again to resume
drawing. You can also use the scrollbars or a trackpad to move around.

Zoom and pan only change the view, so they do not add Undo steps. Strokes, shapes,
text, and fills keep their drawing size and position. The board stays accessible
by scrolling if you make the window smaller.

Click **Layers** on the right of the drawing area to open the sidebar. Use
**Add layer** to create a new layer above the others, then click a layer to select
it. The selected layer receives all drawing, text, erasing, and bucket fills.

Drag a layer by its name to reorder it, then release at the highlighted line.
Drag near the list edges to scroll, or press Escape to cancel. With a layer
focused, **Alt + ↑/↓** moves it one position at a time. Layers higher in the list appear in front of lower
layers. Moving a layer preserves its artwork, name, visibility, and selection.
Hidden layers can be reordered too.

Click the eye beside a layer to hide or show its artwork. Hidden layers keep
their artwork and position in the stack, and are marked **Hidden** in the list.
Show a hidden selected layer or select a visible layer before drawing on it.
You can hide every layer, including the last one.

Click the pencil beside a layer to rename it. Press Enter or click **Save** to
apply the name; press Escape or click **Cancel** to discard it. Empty names keep
the current name. Switching layers or drawing also saves the name.

Click the trash button beside a layer to remove it and its artwork. Removing the
selected layer selects the layer below it (or the next layer if it was the bottom
one). At least one layer must remain.

Adding, renaming, removing, reordering, and hiding/showing layers work with Undo and Redo,
including restoring removed artwork. **Clear All** clears artwork from every
layer, including hidden layers, and can be undone.
Close the sidebar with its close button or Escape;
opening and closing it keeps the canvas and drawing in place.

With a keyboard, Tab to a tool and use the arrow keys to switch. Focus Shapes
and press Enter to open its menu, use arrows to choose a shape, then Enter to
confirm. Escape closes the menu.

- **Marker:** a solid, round line.
- **Highlighter:** a kinda translucent line. 
- **Bucket:** choose a color, then click or tap inside an enclosed area to fill it.
    Fills work with Undo, Redo, and Clear All, and stay in place when the window resizes.
- **Line:** drag from the start to the end of a straight line.
- **Rectangle:** drag between opposite corners to draw an outline.
- **Circle:** drag from its center outward to set the radius.

Shapes preview while you drag. Release to finish, or press Escape to cancel.
They use your selected color and width, and work with Undo, Redo, and Clear All.

Command Z and Cmd Shift Z also work. 
Choose black, red, orange, green, blue, or purple from the bottom color palette.
Click the thing to choose a **custom color**, including white. Custom
colors work with Marker, Highlighter, Bucket, Shapes, Text, and Math symbols.
The picker remembers your last custom color while the page is open; click it
again to reuse or change that color. Changing color also updates an open text box.
Click the **eyedropper** beside the palette, then click or tap the drawing to reuse
a visible color. It samples all visible layers against the white background, then
returns to your drawing tool. Press Escape to cancel.
Use the **Width** slider for sizes from 1–50 pixels. Each drawing tool
remember their own size while the page is open.
Use the **Opacity** slider from 0–100% to control transparency for new strokes,
shapes, fills, text, and math. For the eraser, lower opacity removes less paint.
Each tool remembers its opacity while the page is open; Highlighter starts at 30%.
Opacity also updates an open text box, and saved artwork keeps its transparency.
Use a mouse, finger, or stylus. Drawings and layers save automatically in this browser after each edit and restore
when you refresh or reopen the same page. The top bar shows **Saved**, or **Not saved**
if browser storage is unavailable or full. Autosave includes hidden layers, layer
names and order, bucket fills, and the selected layer. Undo/Redo history resets
when the page reopens. Clearing browser data removes the saved drawing.

## Open the website

Open `web/index.html` directly in your browser, or run a local server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory web
```

Visit http://localhost:8080. If the server is already running, just refresh.

## The code

- `web/app.js`: marker drawing, erasing, and clearing in plain JavaScript.
  Marker starts at 5 pixels, highlighter at 20, and eraser at 20.
  Lines, rectangles, and circles start at 5 pixels.
- `web/index.html`: the toolbar, text box, and page styling.

After editing either file, refresh the page. No compiler, dependencies, or build
step is needed.

Run the bucket fill and zoom tests with `node --test tests/*.test.cjs`.
